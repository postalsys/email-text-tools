'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const mimeHtml = require('../lib/mime-html');
const textToHtml = require('../lib/text-to-html');
const htmlToText = require('../lib/html-to-text');
const inlineHtml = require('../lib/inline-html');
const inlineText = require('../lib/inline-text');
const formatDate = require('../lib/format-date');

function timed(fn) {
    const start = process.hrtime.bigint();
    const result = fn();
    return { result, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

function headStyle(css) {
    return `<html><head><style>${css}</style></head><body><p class="x">content</p></body></html>`;
}

describe('hostile input hardening', () => {
    after(async () => {
        await mimeHtml.closeWorkerPool();
    });

    describe('CSS selector pre-filter', () => {
        const { filterCss, hasNotWithPseudo } = mimeHtml._internal;

        // The regex pre-filter this replaces took 26 s on 900 bytes of ":not(a:b)" and never
        // finished on 1.8 KB. Timed directly on large inputs, so the bound is about the filter and
        // not about jsdom or juice.
        function assertLinear(fn, unit) {
            const small = unit.repeat(Math.ceil((256 * 1024) / unit.length));
            const large = small + small;
            fn(small); // warm up
            const a = timed(() => fn(small));
            const b = timed(() => fn(large));
            // doubling the input must not blow up the time (loose bound, the old regex was cubic)
            assert.ok(b.ms < Math.max(a.ms * 6, 200), `${fn.name}: 256 KB ${a.ms} ms vs 512 KB ${b.ms} ms`);
        }

        // Units that never match, so the whole input is scanned
        for (const unit of [':not(.a)', ':not(((.a)))', ':nox(a:b)', '(((:', ')))']) {
            it(`hasNotWithPseudo stays linear on repeated ${JSON.stringify(unit)}`, () => {
                assert.equal(hasNotWithPseudo(unit), false);
                assertLinear(hasNotWithPseudo, unit);
            });
        }

        for (const unit of ['p:not(.a) { color: red }', 'p:not(a:b){color:red}', 'p:is(.a){}', '{{:not(.a)}', ':not(.a){', '@media x { :where(p) { a: b } }']) {
            it(`filterCss stays linear on repeated ${JSON.stringify(unit)}`, () => {
                assertLinear(filterCss, unit);
            });
        }

        it('hasNotWithPseudo matches a pseudo-class only inside :not()', () => {
            assert.equal(hasNotWithPseudo('p:not(a:hover)'), true);
            assert.equal(hasNotWithPseudo('P:NOT(A:HOVER)'), true);
            assert.equal(hasNotWithPseudo('p:not(:not(.a))'), true);
            assert.equal(hasNotWithPseudo('p:not(.y):hover'), false);
            assert.equal(hasNotWithPseudo('p:not(.y(z)):hover'), false);
            assert.equal(hasNotWithPseudo('a:hover'), false);
        });

        it('filterCss returns style text without risky pseudo-classes unchanged', () => {
            const css = '@media screen { p { color: red } } a:hover { color: blue } p:not(.y) {}';
            assert.equal(filterCss(css), css);
        });

        it('mimeHtml stays fast on a hostile selector list', () => {
            const { result, ms } = timed(() => mimeHtml({ html: headStyle(':not(a:b)'.repeat(512)) }));
            assert.ok(result.includes('content'));
            assert.ok(ms < 2500, `took ${ms} ms`);
        });

        it('drops only the rules with problematic selectors', () => {
            const css = [
                'p { color: red; }',
                'p:is(.x) { font-weight: bold; }',
                'p:where(.x) { margin: 1px; }',
                'p:has(b) { padding: 2px; }',
                'P:NOT(A:HOVER) { text-align: center; }',
                'p:not(.y):hover { text-decoration: underline; }',
                'p:not(.y) { font-style: italic; }',
                '@media screen { p:is(.x) { border: 1px solid; } }'
            ].join('\n');
            const result = mimeHtml({ html: headStyle(css) });
            assert.match(result, /color: red/);
            assert.match(result, /font-style: italic/);
            assert.doesNotMatch(result, /font-weight/);
            assert.doesNotMatch(result, /margin/);
            assert.doesNotMatch(result, /padding/);
            assert.doesNotMatch(result, /text-align/);
            assert.doesNotMatch(result, /border/);
        });

        it('keeps rules nested in at-rules that use safe selectors', () => {
            const html = headStyle('@media screen { p:is(.a) { color: red; } } p { color: blue; }');
            const result = mimeHtml({ html });
            assert.match(result, /color: blue/);
        });

        it('caps the amount of style text processed', () => {
            const filler = '.unused { color: red; }\n'.repeat(Math.ceil((300 * 1024) / 24));
            const html = headStyle(filler + 'p.x { color: blue; }');
            const result = mimeHtml({ html });
            assert.ok(result.includes('content'));
            assert.doesNotMatch(result, /color: blue/);
        });

        it('cuts the style text at a rule boundary, so a truncated rule is not inlined unfiltered', () => {
            // the cap falls inside the last rule, after its declarations but before its closing brace
            const rule = 'p:is(.x) { color: green; }';
            const prefixLength = 256 * 1024 - rule.length + 1;
            const filler = '.unused { color: red; }\n'.repeat(Math.floor(prefixLength / 24));
            const html = headStyle(filler + ' '.repeat(prefixLength - filler.length) + rule);
            const result = mimeHtml({ html });
            assert.ok(result.includes('content'));
            assert.doesNotMatch(result, /color: green/);
        });
    });

    describe('deep nesting', () => {
        it('textToHtml does not overflow the stack on 5000 quote levels', () => {
            const result = textToHtml('>'.repeat(5000) + ' deep\nafter');
            assert.equal((result.match(/<blockquote /g) || []).length, 100);
            assert.ok(result.includes('deep'));
            assert.ok(result.includes('after'));
        });

        it('textToHtml keeps normal nested quotes', () => {
            const result = textToHtml('>> two\n> one\nnone');
            assert.ok(result.includes('ee-block-1'));
            assert.ok(result.includes('ee-block-2'));
        });

        const FALLBACK_PREFIX = '<div style="overflow: auto;"><div style="white-space: pre-wrap;">';

        it('mimeHtml falls back to escaped text on 4000 nested divs', () => {
            const html = 'hello &lt;img src=x onerror=alert(1)&gt;' + '<div>'.repeat(4000) + 'deep' + '</div>'.repeat(4000);
            const { result, ms } = timed(() => mimeHtml({ html }));
            assert.ok(result.startsWith(FALLBACK_PREFIX));
            assert.ok(result.includes('hello &lt;img'));
            assert.doesNotMatch(result, /<img/);
            // text below the html-to-text depth limit is dropped
            assert.doesNotMatch(result, /deep/);
            assert.ok(ms < 10000, `took ${ms} ms`);
        });

        it('mimeHtml does not spend seconds on 50000 unclosed <b> tags', () => {
            const { result, ms } = timed(() => mimeHtml({ html: 'shallow' + '<b>'.repeat(50000) + 'bold' }));
            assert.ok(result.startsWith(FALLBACK_PREFIX));
            assert.ok(result.includes('shallow'));
            assert.ok(ms < 15000, `took ${ms} ms`);
        });

        for (const [label, html] of [
            ['self-closing HTML tags', '<div/>'.repeat(20000) + 'deep'],
            ['cells nested in SVG', '<svg>' + '<td>'.repeat(20000) + 'deep'],
            ['an abruptly closed comment', '<!-->' + '<b>'.repeat(20000) + 'deep-->'],
            ['style inside SVG', '<svg><style>' + '<b>'.repeat(20000) + 'deep']
        ]) {
            it(`mimeHtml depth check is not bypassed by ${label}`, () => {
                const { result, ms } = timed(() => mimeHtml({ html }));
                assert.ok(result.startsWith(FALLBACK_PREFIX));
                assert.ok(ms < 15000, `took ${ms} ms`);
            });
        }

        it('mimeHtml keeps long flat content with implicitly closed tags', () => {
            const html = '<p>para'.repeat(3000) + '<ul>' + '<li>item'.repeat(3000) + '</ul><table>' + '<tr><td>cell'.repeat(3000) + '</table>';
            const result = mimeHtml({ html });
            assert.doesNotMatch(result, /white-space: pre-wrap/);
            assert.ok(result.includes('<li>item</li>'));
        });

        it('mimeHtml prefers the text part for the fallback', () => {
            const result = mimeHtml({ html: '<div>'.repeat(4000) + 'html part', text: 'text <part>' });
            assert.ok(result.includes('text &lt;part&gt;'));
        });

        it('mimeHtml still renders moderately nested HTML normally', () => {
            const result = mimeHtml({ html: '<div>'.repeat(200) + 'normal' + '</div>'.repeat(200) });
            assert.ok(result.includes('<div><div>'));
            assert.ok(result.includes('normal'));
        });

        it('mimeHtml handles text with 5000 quote levels', () => {
            const result = mimeHtml({ text: '>'.repeat(5000) + ' deep' });
            assert.ok(result.includes('deep'));
        });

        it('mimeHtml.async falls back instead of rejecting', async () => {
            const result = await mimeHtml.async({ html: 'async shallow' + '<div>'.repeat(4000) + 'async deep' });
            assert.ok(result.startsWith(FALLBACK_PREFIX));
            assert.ok(result.includes('async shallow'));
        });

        it('mimeHtml.async rejects on hostile nesting with fallbackOnError: false', async () => {
            await assert.rejects(mimeHtml.async({ html: '<div>'.repeat(4000) + 'x' }, { fallbackOnError: false }), /nested too deep/);
        });

        it('mimeHtml.async skips the juice worker when there is no style sheet', async () => {
            await mimeHtml.closeWorkerPool();
            const result = await mimeHtml.async({ html: '<p style="color: red">no sheet</p>' });
            assert.ok(result.includes('no sheet'));
            assert.equal(mimeHtml.getWorkerPoolStats(), null);
        });

        it('htmlToText does not overflow the stack on deep nesting', () => {
            for (const tag of ['div', 'b', 'blockquote']) {
                const html = 'hello &amp; <b>world</b>' + `<${tag}>`.repeat(20000) + 'deep' + `</${tag}>`.repeat(20000) + 'after';
                const text = htmlToText(html);
                assert.ok(text.startsWith('hello & world'), text);
                assert.ok(text.includes('after'), text);
                // content below the depth limit is dropped
                assert.ok(!text.includes('deep'), text);
            }
        });
    });

    describe('sanitizer policy', () => {
        it('removes forms and form controls but keeps their text', () => {
            const html =
                '<form action="https://evil.example/collect" method="post"><p>Please log in</p>' +
                '<input type="password" name="p"><select><option>a</option></select>' +
                '<textarea>typed</textarea><button formaction="https://evil.example/x">Send</button></form>';
            const result = mimeHtml({ html });
            assert.doesNotMatch(result, /<form|<input|<select|<textarea|<button/i);
            assert.doesNotMatch(result, /evil\.example/);
            assert.ok(result.includes('Please log in'));
            assert.ok(result.includes('Send'));
        });

        it('removes forbidden style properties, including from styles juice inlined', () => {
            const html =
                '<html><head><style>p.x { float: left; color: red; }</style></head><body style="position: fixed">' +
                '<div style="Position: absolute; top: 0">a</div><span style="small: 1; color: blue">b</span><p class="x">c</p></body></html>';
            const result = mimeHtml({ html });
            assert.doesNotMatch(result, /position|float/i);
            assert.ok(result.includes('top: 0'));
            assert.ok(result.includes('color: red'));
            assert.ok(result.includes('color: blue'));
        });

        it('removes popover and form submission attributes', () => {
            const html = '<div popover id="p">overlay</div><a href="https://example.com/" popovertarget="p" formaction="https://evil.example/">link</a>';
            const result = mimeHtml({ html });
            assert.doesNotMatch(result, /popover|formaction/i);
            assert.ok(result.includes('overlay'));
            assert.ok(result.includes('href="https://example.com/"'));
        });
    });

    describe('reply/forward date header', () => {
        const date = new Date('2024-06-15T14:30:00Z');
        const hasLocale = locale => Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;

        it('formats in English by default', () => {
            assert.equal(formatDate(date, { tz: 'UTC' }), 'Sat, Jun 15, 2024, 2:30 PM');
        });

        it('honors the time zone', () => {
            assert.equal(formatDate(date, { tz: 'America/New_York' }), 'Sat, Jun 15, 2024, 10:30 AM');
            assert.equal(formatDate(date, { tz: 'Asia/Tokyo' }), 'Sat, Jun 15, 2024, 11:30 PM');
        });

        it('honors the locale', t => {
            if (!hasLocale('de') || !hasLocale('et') || !hasLocale('ja')) {
                t.skip('Node built without full ICU data');
                return;
            }
            assert.equal(formatDate(date, { locale: 'de', tz: 'Europe/Berlin' }), 'Sa., 15. Juni 2024, 16:30');
            assert.equal(formatDate(date, { locale: 'et', tz: 'Europe/Tallinn' }), 'L, 15. juuni 2024, 17:30');
            assert.ok(formatDate(date, { locale: 'ja', tz: 'Asia/Tokyo' }).includes('2024'));
            assert.ok(formatDate(date, { locale: 'ja', tz: 'Asia/Tokyo' }).includes('23:30'));
        });

        it('falls back to English on an invalid or unknown locale', () => {
            assert.equal(formatDate(date, { locale: 'not a locale!!', tz: 'UTC' }), 'Sat, Jun 15, 2024, 2:30 PM');
            assert.equal(formatDate(date, { locale: 'xx', tz: 'UTC' }), 'Sat, Jun 15, 2024, 2:30 PM');
        });

        it('falls back to UTC on an unknown time zone', () => {
            assert.equal(formatDate(date, { tz: 'Not/AZone' }), 'Sat, Jun 15, 2024, 2:30 PM');
        });

        it('accepts date strings and passes invalid dates through', () => {
            assert.equal(formatDate('2024-06-15T14:30:00Z', { tz: 'UTC' }), 'Sat, Jun 15, 2024, 2:30 PM');
            assert.equal(formatDate('Sat, 15 Jun 2024 14:30:00 +0000', { tz: 'UTC' }), 'Sat, Jun 15, 2024, 2:30 PM');
            assert.equal(formatDate('garbage', {}), 'garbage');
        });

        it('is used by inlineHtml and inlineText', () => {
            const data = { date, from: { address: 'a@example.com' }, subject: 'S', html: '<p>Body</p>', text: 'Body' };
            assert.ok(inlineHtml('forward', '', data, { tz: 'UTC' }).includes('Sat, Jun 15, 2024, 2:30 PM'));
            assert.ok(inlineText('forward', '', data, { tz: 'UTC' }).includes('Date: Sat, Jun 15, 2024, 2:30 PM'));
        });
    });

    describe('lazy loading', () => {
        it('requiring the package does not load jsdom until mimeHtml is used', () => {
            // A fresh process, since this test process has already loaded jsdom
            const script = [
                "const tools = require('.');",
                "const loaded = () => Object.keys(require.cache).some(k => k.includes('/node_modules/jsdom/'));",
                'const before = loaded();',
                "tools.htmlToText('<p>x</p>');",
                'const afterText = loaded();',
                "const out = tools.mimeHtml({ html: '<p>x</p>' });",
                'console.log(JSON.stringify([before, afterText, loaded(), typeof tools.mimeHtml.async, out]));'
            ].join('\n');
            const output = execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..') }).toString();
            const [before, afterText, afterMime, asyncType, out] = JSON.parse(output);
            assert.equal(before, false);
            assert.equal(afterText, false);
            assert.equal(afterMime, true);
            assert.equal(asyncType, 'function');
            assert.equal(out, '<div style="overflow: auto;"><p>x</p></div>');
        });

        it('keeps mimeHtml enumerable and destructurable', () => {
            const tools = require('..');
            assert.ok(Object.keys(tools).includes('mimeHtml'));
            const { mimeHtml: fn } = tools;
            assert.equal(fn, mimeHtml);
        });
    });
});

describe('forbidden style properties behind CSS escapes', () => {
    it('strips a position property whose name uses CSS escapes', () => {
        // a browser reads p\osition and \70 osition as position, jsdom's CSSOM does not
        const html = '<div style="p\\osition: fixed; color: red; \\70 osition: absolute; float: left">x</div>';
        const out = mimeHtml({ html });
        assert.ok(!/position/i.test(out), out);
        assert.ok(!/float/i.test(out), out);
        assert.ok(/color:\s*red/i.test(out), out);
    });
});
