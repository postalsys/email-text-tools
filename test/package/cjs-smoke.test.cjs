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
        assert.deepEqual(Object.keys(tools), ['textToHtml', 'htmlToText', 'inlineHtml', 'inlineText', 'mimeHtml']);
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
