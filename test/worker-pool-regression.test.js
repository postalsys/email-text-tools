'use strict';

const { describe, it, after: _after } = require('node:test');
const assert = require('node:assert/strict');
const WorkerPool = require('../lib/worker-pool');
const path = require('path');

// Test for the worker pool free list regression fix
describe('Worker Pool Regression Tests', () => {
    describe('free workers list management', () => {
        it('should properly return workers to free list after completion', async () => {
            // Create a simple test worker
            const fs = require('fs');
            const workerPath = path.join(__dirname, 'test-regression-worker.js');
            const workerCode = `
                const { parentPort } = require('worker_threads');
                parentPort.on('message', (data) => {
                    setTimeout(() => {
                        parentPort.postMessage({ success: true, result: data });
                    }, 10);
                });
            `;
            fs.writeFileSync(workerPath, workerCode);

            try {
                const pool = new WorkerPool({
                    workerPath,
                    minWorkers: 2,
                    maxWorkers: 4
                });

                // Initial state check
                let stats = pool.getStats();
                assert.equal(stats.totalWorkers, 2);
                assert.equal(stats.freeWorkers, 2);
                assert.equal(stats.busyWorkers, 0);

                // Process multiple tasks concurrently
                const promises = [];
                for (let i = 0; i < 10; i++) {
                    promises.push(pool.process(`task ${i}`));
                }

                // Wait for all to complete
                const results = await Promise.all(promises);

                // All tasks should complete successfully
                assert.equal(results.length, 10);
                results.forEach((result, i) => {
                    assert.equal(result, `task ${i}`);
                });

                // After completion, all workers should be free
                stats = pool.getStats();
                assert.equal(stats.busyWorkers, 0);
                assert.equal(stats.freeWorkers, stats.totalWorkers);

                // Process another batch to ensure workers are reusable
                const secondBatch = [];
                for (let i = 0; i < 5; i++) {
                    secondBatch.push(pool.process(`second ${i}`));
                }

                const secondResults = await Promise.all(secondBatch);
                assert.equal(secondResults.length, 5);

                // Workers should still be properly managed
                stats = pool.getStats();
                assert.equal(stats.busyWorkers, 0);
                assert.equal(stats.freeWorkers, stats.totalWorkers);

                await pool.close();
            } finally {
                // Clean up test worker
                const fs = require('fs');
                try {
                    fs.unlinkSync(workerPath);
                } catch (_err) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should not have duplicate workers in free list', async () => {
            const fs = require('fs');
            const workerPath = path.join(__dirname, 'test-dup-worker.js');
            const workerCode = `
                const { parentPort } = require('worker_threads');
                parentPort.on('message', (data) => {
                    setTimeout(() => {
                        parentPort.postMessage({ success: true, result: data });
                    }, 5);
                });
            `;
            fs.writeFileSync(workerPath, workerCode);

            try {
                const pool = new WorkerPool({
                    workerPath,
                    minWorkers: 1,
                    maxWorkers: 2
                });

                // Process tasks to trigger worker management
                const results = await Promise.all([pool.process('A'), pool.process('B'), pool.process('C')]);

                assert.equal(results.length, 3);

                // Check that free workers count matches actual workers
                const stats = pool.getStats();
                assert.ok(stats.freeWorkers <= stats.totalWorkers);
                assert.equal(stats.busyWorkers, 0);

                // The sum should always equal total
                assert.equal(stats.busyWorkers + stats.freeWorkers, stats.totalWorkers);

                await pool.close();
            } finally {
                const fs = require('fs');
                try {
                    fs.unlinkSync(workerPath);
                } catch (_err) {
                    // Ignore
                }
            }
        });
    });
});
