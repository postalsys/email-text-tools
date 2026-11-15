'use strict';

// mimeHtml runs for every message a long-lived process renders, so nothing it touches may keep a
// message alive after the call. Two dependencies did:
//
// - jsdom 27 to 29: a document got a selector engine on its first querySelector(), and the engine
//   (@asamuzakjp/dom-selector before 8.x) added nine capture listeners to the document's window
//   that nothing removed. Every message is parsed on the one window this module keeps, so every
//   message stayed reachable from it, 56 to 80 KB each.
// - juice 11: selectors were parsed by slick, which caches every selector string it has seen in a
//   module level object, one entry per unique class or id of every message.
//
// test/package/cjs-smoke.test.cjs checks the bundles no longer carry either package.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

// Runs a script in a fresh process that can force garbage collection
function runWithGc(script) {
    return execFileSync(process.execPath, ['--expose-gc', '-e', script], { cwd: root, encoding: 'utf8' }).trim();
}

describe('memory held between calls', () => {
    it('does not keep a document parsed on a shared window alive after a selector query', () => {
        const script = `
            const { JSDOM } = require('./dist/vendor/jsdom.cjs');
            const { window } = new JSDOM('');
            const refs = [];
            for (let i = 0; i < 20; i++) {
                const doc = new window.DOMParser().parseFromString('<p class="a">' + i + '</p>', 'text/html');
                doc.querySelector('p.a');
                doc.querySelectorAll('[class]');
                refs.push(new WeakRef(doc));
            }
            // A WeakRef target stays alive until the job that created it ends
            setTimeout(() => {
                global.gc();
                global.gc();
                console.log(refs.filter(ref => ref.deref()).length);
            }, 10);
        `;
        assert.equal(runWithGc(script), '0');
    });

    it('retains no message heap across thousands of mimeHtml calls', () => {
        // Every message carries its own class, id and stylesheet, the way generated mail and
        // quoted replies do. The leaking versions retained over 300 MB here; the current ones settle
        // around 2 to 4 MB of warmed up code and caches, whatever the count
        const script = `
            const mimeHtml = require('@postalsys/email-text-tools/lib/mime-html');
            const message = i =>
                '<html><head><style>.c' + i + ' { color: red; } #m_' + i + ' p { margin: 0; }</style></head>' +
                '<body><div class="c' + i + '" id="m_' + i + '"><p style="color: blue">' + i + ' ' + 'x'.repeat(2000) +
                '<a href="https://example.com/' + i + '">link</a></p></div></body></html>';
            const settle = () => new Promise(resolve => setTimeout(resolve, 20)).then(() => { global.gc(); global.gc(); });
            (async () => {
                for (let i = 0; i < 50; i++) mimeHtml({ html: message(i) });
                await settle();
                const before = process.memoryUsage().heapUsed;
                for (let i = 0; i < 3000; i++) mimeHtml({ html: message(1000 + i) });
                await settle();
                await settle();
                console.log(process.memoryUsage().heapUsed - before);
            })();
        `;
        const retained = Number(runWithGc(script));
        assert.ok(retained < 20 * 1024 * 1024, `retained ${(retained / 1024 / 1024).toFixed(1)} MB`);
    });
});
