'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const mimeHtml = require('../lib/mime-html');
const fs = require('fs');
const path = require('path');

describe('Edge Cases', () => {
    describe('large HTML', () => {
        it('should handle large HTML', async () => {
            const largeContent = '<p>' + 'x'.repeat(10000) + '</p>';
            const result = await mimeHtml.async({ html: largeContent });
            assert.ok(result.length > 0);
        });
    });

    describe('special characters', () => {
        it('should handle UTF-8', () => {
            const result = mimeHtml.sync({ html: '<p>Hello 世界</p>' });
            assert.ok(result.includes('Hello'));
        });

        it('should handle entities', () => {
            const result = mimeHtml.sync({ html: '<p>&lt;&gt;&amp;</p>' });
            assert.ok(result.includes('&lt;') || result.includes('<'));
        });
    });

    describe('problematic CSS', () => {
        it('should handle modern selectors', () => {
            const html = `
                <style>
                    .test:is(.a) { color: red; }
                </style>
                <p class="test a">Test</p>
            `;
            const result = mimeHtml.sync({ html });
            assert.ok(result.includes('Test'));
        });
    });

    describe('real-world HTML', () => {
        it('should process failing.html quickly', async () => {
            const failingPath = path.join(__dirname, '../examples/failing.html');
            if (fs.existsSync(failingPath)) {
                const html = fs.readFileSync(failingPath, 'utf8');

                const start = Date.now();
                const result = await mimeHtml.async({ html });
                const elapsed = Date.now() - start;

                assert.ok(result.length > 0);
                assert.ok(elapsed < 2000, `Took ${elapsed}ms`);
            }
        });
    });

    after(async () => {
        await mimeHtml.closeWorkerPool();
    });
});
