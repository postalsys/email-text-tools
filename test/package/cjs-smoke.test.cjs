'use strict';

// CommonJS checks of the built package, loaded by name the way EmailEngine loads it. `npm run test:cjs`
// runs this (with the rest of the suite) under NODE_OPTIONS=--no-experimental-require-module:
// EmailEngine bundles this package into a @yao-pkg/pkg binary that can only load a CommonJS module
// graph, and Node 22+ enables require(esm) by default, which would hide an ES module reached
// through require(). With the flag set, such a module throws ERR_REQUIRE_ESM here instead of in
// the binary. Kept as plain JavaScript on purpose: a TypeScript loader could transpile an ES
// module dependency to CommonJS and mask exactly the failure this guards against.

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const tools = require('@postalsys/email-text-tools');

describe('CommonJS build', () => {
    after(async () => {
        await tools.mimeHtml.closeWorkerPool();
    });

    it('resolves every entry point to dist/cjs', () => {
        assert.equal(require.resolve('@postalsys/email-text-tools'), path.join(root, 'dist', 'cjs', 'index.js'));
        for (const entry of ['index', 'index.js']) {
            assert.equal(require.resolve('@postalsys/email-text-tools/' + entry), path.join(root, 'dist', 'cjs', 'index.js'));
        }
        for (const name of [
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
        ]) {
            const file = path.join(root, 'dist', 'cjs', 'lib', name + '.js');
            assert.equal(require.resolve('@postalsys/email-text-tools/lib/' + name), file);
            assert.equal(require.resolve('@postalsys/email-text-tools/lib/' + name + '.js'), file);
        }
        assert.equal(require('@postalsys/email-text-tools/package.json').name, '@postalsys/email-text-tools');
    });

    it('keeps the shape of the pre-TypeScript module', () => {
        assert.deepEqual(Object.keys(tools), ['textToHtml', 'htmlToText', 'inlineHtml', 'inlineText', 'mimeHtml', 'INLINE_STYLE_BLOCK']);
        assert.equal(tools.INLINE_STYLE_BLOCK, require('@postalsys/email-text-tools/lib/inline-style').INLINE_STYLE_BLOCK);
        assert.match(tools.INLINE_STYLE_BLOCK, /^<style>[\s\S]*blockquote[\s\S]*<\/style>$/);
        for (const key of ['textToHtml', 'htmlToText', 'inlineHtml', 'inlineText']) {
            const descriptor = Object.getOwnPropertyDescriptor(tools, key);
            assert.ok(descriptor.writable && descriptor.enumerable, key);
            assert.equal(tools[key], require('@postalsys/email-text-tools/lib/' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())));
        }
        assert.equal(typeof Object.getOwnPropertyDescriptor(tools, 'mimeHtml').get, 'function');
        assert.equal(tools.default, tools);
        assert.ok(!Object.keys(tools).includes('default'));

        const mimeHtml = require('@postalsys/email-text-tools/lib/mime-html');
        assert.equal(tools.mimeHtml, mimeHtml);
        assert.deepEqual(Object.keys(mimeHtml), ['async', 'sync', '_internal', 'closeWorkerPool', 'getWorkerPoolStats']);

        const WorkerPool = require('@postalsys/email-text-tools/lib/worker-pool');
        assert.equal(typeof WorkerPool, 'function');
        assert.equal(WorkerPool.default, WorkerPool);

        assert.deepEqual(Object.keys(require('@postalsys/email-text-tools/lib/inline-style')), ['INLINE_STYLE_BLOCK']);

        assert.deepEqual(Object.keys(require('@postalsys/email-text-tools/lib/html-guard')).sort(), [
            'MAX_NESTING_DEPTH',
            'exceedsNestingDepth',
            'fallbackText'
        ]);
    });

    it('runs juice in the CommonJS worker of the pool', async () => {
        const html = await tools.mimeHtml.async({ html: '<style>p { color: red; }</style><p>x</p>' }, { fallbackOnError: false });
        assert.match(html, /<p style="color: red;">x<\/p>/);
    });

    it('runs juice in a single CommonJS worker', async () => {
        const html = await tools.mimeHtml.async({ html: '<style>p { color: red; }</style><p>x</p>' }, { useWorkerPool: false, fallbackOnError: false });
        assert.match(html, /<p style="color: red;">x<\/p>/);
    });

    it('links the full top level domain list', () => {
        assert.match(tools.textToHtml('see example.photography'), /<a href="http:\/\/example\.photography">/);
    });
});

// jsdom and juice pull in ES module only packages, so they ship as the CommonJS bundles that
// scripts/bundle-vendor.js builds, and the packages themselves must never be runtime dependencies
for (const name of ['jsdom', 'juice']) {
    describe(`bundled ${name}`, () => {
        const manifest = require(path.join(root, 'package.json'));
        const vendor = path.join(root, 'dist', 'vendor');

        it('is not a runtime dependency', () => {
            assert.ok(!(name in (manifest.dependencies || {})));
            assert.ok(name in manifest.devDependencies);
        });

        it('loads from dist/vendor, the version the package was built with', () => {
            tools.mimeHtml({ html: '<style>p { color: red; }</style><p>x</p>' });
            assert.ok(Object.keys(require.cache).includes(path.join(vendor, `${name}.cjs`)));
            assert.ok(!Object.keys(require.cache).some(file => file.includes(`${path.sep}node_modules${path.sep}${name}${path.sep}`)));
            const packages = require(path.join(vendor, `${name}.packages.json`));
            assert.equal(packages.find(entry => entry.name === name).version, require(`${name}/package.json`).version);
            for (const entry of packages) {
                assert.ok(entry.license, `${entry.name} declares a license`);
            }
        });
    });
}

describe('bundled packages at work', () => {
    const vendor = path.join(root, 'dist', 'vendor');

    it('jsdom carries its parser and serves computed styles from its default stylesheet', () => {
        assert.ok(require(path.join(vendor, 'jsdom.packages.json')).some(entry => entry.name === 'parse5'));
        const { JSDOM } = require(path.join(vendor, 'jsdom.cjs'));
        const { window } = new JSDOM('<p>x</p>');
        assert.equal(window.getComputedStyle(window.document.querySelector('p')).display, 'block');
    });

    it('juice inlines a stylesheet', () => {
        const juice = require(path.join(vendor, 'juice.cjs'));
        assert.match(juice('<style>p { color: red; }</style><p>x</p>'), /<p style="color: red;">x<\/p>/);
    });

    it('juice does not parse selectors with slick', () => {
        // slick caches every selector it has seen for the life of the process, see test/memory.test.cjs
        assert.ok(!require(path.join(vendor, 'juice.packages.json')).some(entry => entry.name === 'slick'));
    });
});
