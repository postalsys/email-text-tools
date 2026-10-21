// Checks of the built package (dist/, built by the pretest script) through the package.json
// exports map, the way an installed copy is loaded: Node resolves the package name to the package
// itself when the specifier is used from inside it. The CommonJS side is covered in more detail by
// cjs-smoke.test.cjs.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import textTools, { textToHtml, htmlToText, inlineHtml, inlineText, mimeHtml, INLINE_STYLE_BLOCK } from '@postalsys/email-text-tools';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsc = require.resolve('typescript/bin/tsc');

const LIB_MODULES = [
    'format-date',
    'html-guard',
    'html-to-text',
    'inline-html',
    'inline-style',
    'inline-text',
    'juice-worker',
    'mime-html',
    'text-to-html',
    'worker-pool'
];

describe('ES module build', () => {
    after(async () => {
        await mimeHtml.closeWorkerPool();
    });

    it('resolves every entry point to dist/esm', () => {
        const esm = file => 'file://' + path.join(root, 'dist', 'esm', file);
        assert.equal(import.meta.resolve('@postalsys/email-text-tools'), esm('index.js'));
        assert.equal(import.meta.resolve('@postalsys/email-text-tools/index'), esm('index.js'));
        assert.equal(import.meta.resolve('@postalsys/email-text-tools/index.js'), esm('index.js'));
        for (const name of LIB_MODULES) {
            assert.equal(import.meta.resolve('@postalsys/email-text-tools/lib/' + name), esm('lib/' + name + '.js'));
            assert.equal(import.meta.resolve('@postalsys/email-text-tools/lib/' + name + '.js'), esm('lib/' + name + '.js'));
        }
    });

    it('exposes named and default exports', async () => {
        assert.deepEqual(Object.keys(textTools), ['textToHtml', 'htmlToText', 'inlineHtml', 'inlineText', 'mimeHtml', 'INLINE_STYLE_BLOCK']);
        assert.equal(textTools.textToHtml, textToHtml);
        assert.equal(textTools.mimeHtml, mimeHtml);
        assert.equal(textTools.INLINE_STYLE_BLOCK, INLINE_STYLE_BLOCK);
        assert.equal((await import('@postalsys/email-text-tools/lib/inline-style')).INLINE_STYLE_BLOCK, INLINE_STYLE_BLOCK);
        assert.match(INLINE_STYLE_BLOCK, /^<style>[\s\S]*blockquote[\s\S]*<\/style>$/);
        assert.equal((await import('@postalsys/email-text-tools/lib/mime-html')).default, mimeHtml);
        assert.equal((await import('@postalsys/email-text-tools/lib/inline-html.js')).default, inlineHtml);
        assert.equal(typeof htmlToText, 'function');
        assert.equal(typeof inlineText, 'function');
        const guard = await import('@postalsys/email-text-tools/lib/html-guard');
        assert.equal(guard.MAX_NESTING_DEPTH, 1000);
        assert.equal(typeof (await import('@postalsys/email-text-tools/lib/worker-pool')).default, 'function');
    });

    it('renders the same output as the CommonJS build', async () => {
        const cjs = require('@postalsys/email-text-tools');
        const message = { html: '<style>p { color: red; }</style><p>Hello example.photography</p>', text: 'Hi\n> quoted' };
        assert.equal(mimeHtml(message), cjs.mimeHtml(message));
        assert.equal(textToHtml(message.text), cjs.textToHtml(message.text));
        assert.equal(htmlToText(message.html), cjs.htmlToText(message.html));
        assert.equal(INLINE_STYLE_BLOCK, cjs.INLINE_STYLE_BLOCK);
    });

    it('runs juice in the ES module worker of the pool', async () => {
        const html = await mimeHtml.async({ html: '<style>p { color: red; }</style><p>x</p>' }, { fallbackOnError: false });
        assert.match(html, /<p style="color: red;">x<\/p>/);
    });

    it('runs juice in a single ES module worker', async () => {
        const html = await mimeHtml.async({ html: '<style>p { color: red; }</style><p>x</p>' }, { useWorkerPool: false, fallbackOnError: false });
        assert.match(html, /<p style="color: red;">x<\/p>/);
    });
});

describe('Packed package', () => {
    it('ships both builds and leaves the sources and tests out', () => {
        // Packs a copy without scripts: npm 10 runs prepare on `npm pack --dry-run` even with
        // --ignore-scripts, which would rebuild dist/ under the test files running in parallel.
        // test/ stays out of the copy too, the worker pool tests create and remove files there
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-text-tools-pack-'));
        let result;
        try {
            fs.cpSync(root, dir, { recursive: true, filter: source => !/[\\/](node_modules|\.git|test)$/.test(source) });
            const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
            delete manifest.scripts;
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
            result = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: dir, encoding: 'utf8' });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        assert.equal(result.status, 0, result.stderr);
        const files = JSON.parse(result.stdout)[0].files.map(file => file.path);
        for (const format of ['cjs', 'esm']) {
            for (const name of ['index', ...LIB_MODULES.map(name => 'lib/' + name)]) {
                assert.ok(files.includes(`dist/${format}/${name}.js`), `dist/${format}/${name}.js is packed`);
                assert.ok(files.includes(`dist/${format}/${name}.d.ts`), `dist/${format}/${name}.d.ts is packed`);
            }
            assert.ok(files.includes(`dist/${format}/lib/commonjs.cjs`));
            assert.ok(files.includes(`dist/${format}/package.json`));
        }
        for (const file of files) {
            assert.ok(!/^(src|test|scripts|benchmark|examples|docs)\//.test(file), `${file} must not be packed`);
        }
    });
});

// each tsc run has its own temporary project, so they run side by side
describe('Type declarations', { concurrency: true, timeout: 120 * 1000 }, () => {
    const esmConsumer = `
import textTools, { mimeHtml, inlineHtml, INLINE_STYLE_BLOCK } from '@postalsys/email-text-tools';
import type { QuotedMessage, MimeHtmlAsyncOptions } from '@postalsys/email-text-tools';
import WorkerPool from '@postalsys/email-text-tools/lib/worker-pool';

export async function run(): Promise<string> {
    const message: QuotedMessage = { from: { name: 'A', address: 'a@example.com' }, subject: 'S', text: 'body' };
    const options: MimeHtmlAsyncOptions = { timeout: 1000 };
    const pool = new WorkerPool({ minWorkers: 1 });
    await pool.close();
    const text: string | undefined = textTools.textToHtml('x');
    const style: string = INLINE_STYLE_BLOCK + textTools.INLINE_STYLE_BLOCK;
    return style + inlineHtml('reply', text, message, { locale: 'en' }) + (await mimeHtml.async({ html: '<p>x</p>' }, options));
}
`;

    const cjsConsumer = `
import textTools = require('@postalsys/email-text-tools');
import mimeHtml = require('@postalsys/email-text-tools/lib/mime-html');

export function run(): string {
    const style: string = textTools.INLINE_STYLE_BLOCK;
    return style + textTools.mimeHtml({ text: 'x' }) + mimeHtml.default.sync({ html: '<p>x</p>' }) + textTools.htmlToText('<p>x</p>');
}
`;

    // Type-checks a consumer against the built declarations the way an installed copy is
    // resolved: the package is linked into a temporary project, so the specifier goes through the
    // package.json exports map
    const typeCheck = async (source, compilerOptions, type) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-text-tools-types-'));
        try {
            fs.mkdirSync(path.join(dir, 'node_modules', '@postalsys'), { recursive: true });
            fs.mkdirSync(path.join(dir, 'node_modules', '@types'), { recursive: true });
            fs.symlinkSync(root, path.join(dir, 'node_modules', '@postalsys', 'email-text-tools'), 'dir');
            fs.symlinkSync(path.join(root, 'node_modules', '@types', 'node'), path.join(dir, 'node_modules', '@types', 'node'), 'dir');
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, ...(type ? { type } : {}) }));
            fs.writeFileSync(path.join(dir, 'consumer.ts'), source);
            fs.writeFileSync(
                path.join(dir, 'tsconfig.json'),
                JSON.stringify({
                    compilerOptions: {
                        target: 'ES2022',
                        lib: ['ES2023', 'DOM'],
                        types: ['node'],
                        strict: true,
                        exactOptionalPropertyTypes: true,
                        skipLibCheck: true,
                        noEmit: true,
                        ...compilerOptions
                    },
                    include: ['consumer.ts']
                })
            );
            return await new Promise(resolve => {
                execFile(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json')], (err, stdout, stderr) =>
                    resolve({ status: err ? Number(err.code) || 1 : 0, output: stdout + stderr })
                );
            });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };

    const node16 = { module: 'node16', moduleResolution: 'node16' };

    for (const [label, options, type] of [
        ['a node16 ES module project', node16, 'module'],
        ['a node16 CommonJS project', node16, undefined],
        ['bundler resolution', { module: 'esnext', moduleResolution: 'bundler' }, 'module'],
        ['node10 resolution', { module: 'commonjs', moduleResolution: 'node10', ignoreDeprecations: '6.0' }, undefined]
    ]) {
        it(`type-check an ES module style consumer in ${label}`, async () => {
            const { status, output } = await typeCheck(esmConsumer, { ...options, esModuleInterop: true }, type);
            assert.equal(status, 0, output);
        });
    }

    it('type-check a CommonJS consumer', async () => {
        const { status, output } = await typeCheck(cjsConsumer, node16);
        assert.equal(status, 0, output);
    });
});
