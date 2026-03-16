'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const mimeHtml = require('../lib/mime-html');

describe('mime-html additional coverage', () => {
    after(async () => {
        await mimeHtml.closeWorkerPool();
    });

    describe('getWorkerPoolStats', () => {
        it('should return null when no pool is initialized', async () => {
            await mimeHtml.closeWorkerPool();
            const stats = mimeHtml.getWorkerPoolStats();
            assert.equal(stats, null);
        });
    });

    describe('pool fallback to single worker', () => {
        it('should still return result when pool times out and falls back', async () => {
            await mimeHtml.closeWorkerPool();

            // Use timeout: 1 to force pool timeout, triggering fallback to single worker
            // Both may time out, but fallbackOnError defaults to true so processing continues
            const result = await mimeHtml.async(
                { html: '<p>Fallback test</p>' },
                {
                    timeout: 1,
                    useWorkerPool: true
                }
            );

            // Should still get a result (with or without inlined CSS)
            assert.ok(result.includes('Fallback test'));
        });
    });
});
