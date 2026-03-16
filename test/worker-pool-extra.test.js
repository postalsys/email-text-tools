'use strict';

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const WorkerPool = require('../lib/worker-pool');

const crashWorkerPath = path.join(__dirname, 'crash-test-worker.js');
const crashWorkerCode = `
'use strict';
const { parentPort } = require('worker_threads');
parentPort.on('message', (data) => {
    if (data === 'crash') {
        setTimeout(() => { throw new Error('intentional crash'); }, 0);
    } else if (data === 'slow') {
        setTimeout(() => {
            parentPort.postMessage({ success: true, result: 'slow: ' + data });
        }, 50);
    } else {
        parentPort.postMessage({ success: true, result: 'ok: ' + data });
    }
});
`;

describe('WorkerPool additional coverage', () => {
    let pool;

    before(() => {
        fs.writeFileSync(crashWorkerPath, crashWorkerCode);
    });

    after(() => {
        try {
            fs.unlinkSync(crashWorkerPath);
        } catch (_err) {
            // ignore cleanup errors
        }
    });

    afterEach(async () => {
        if (pool) {
            await pool.close();
            pool = null;
        }
    });

    describe('worker error handling', () => {
        it('should replace a crashed worker and remain functional', async () => {
            pool = new WorkerPool({
                workerPath: crashWorkerPath,
                minWorkers: 2,
                maxWorkers: 3
            });

            // Verify initial state
            let stats = pool.getStats();
            assert.equal(stats.totalWorkers, 2);

            // Trigger a crash
            try {
                await pool.process('crash');
                assert.fail('Should have rejected');
            } catch (err) {
                assert.ok(err);
            }

            // Wait for replacement worker to be created
            await new Promise(r => setTimeout(r, 300));

            // Pool should have replaced the crashed worker
            stats = pool.getStats();
            assert.ok(stats.totalWorkers >= 2, `Expected >= 2 workers but got ${stats.totalWorkers}`);

            // Pool should still be functional
            const result = await pool.process('hello');
            assert.equal(result, 'ok: hello');
        });
    });

    describe('idle timeout', () => {
        it('should terminate idle worker above minimum via _setupIdleTimeout', async () => {
            pool = new WorkerPool({
                workerPath: crashWorkerPath,
                minWorkers: 1,
                maxWorkers: 3,
                idleTimeout: 200
            });

            assert.equal(pool.getStats().totalWorkers, 1);

            // Manually create an extra worker above minWorkers (without a task).
            // This triggers _setupIdleTimeout in _createWorker.
            pool._createWorker();

            assert.equal(pool.getStats().totalWorkers, 2);

            // Wait for idle timeout to fire and remove the extra worker
            await new Promise(r => setTimeout(r, 400));

            assert.equal(pool.getStats().totalWorkers, 1);
        });
    });

    describe('close with active idle timeouts', () => {
        it('should close cleanly when workers have pending idle timeouts', async () => {
            pool = new WorkerPool({
                workerPath: crashWorkerPath,
                minWorkers: 1,
                maxWorkers: 3,
                idleTimeout: 10000
            });

            // Scale up
            const promises = [];
            for (let i = 0; i < 3; i++) {
                promises.push(pool.process(`task-${i}`));
            }
            await Promise.all(promises);

            // Workers above min should have idle timeouts set
            let stats = pool.getStats();
            assert.ok(stats.totalWorkers > 1);

            // Close immediately before idle timeout fires
            await pool.close();
            pool = null;

            // Should not throw or leak timers
        });
    });
});
