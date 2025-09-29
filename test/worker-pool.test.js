'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const WorkerPool = require('../lib/worker-pool');
const path = require('path');

// Create a simple test worker
const testWorkerCode = `
const { parentPort } = require('worker_threads');

parentPort.on('message', (data) => {
    // Simulate some processing
    setTimeout(() => {
        if (data === 'error') {
            parentPort.postMessage({ success: false, error: 'Test error' });
        } else if (data === 'slow') {
            // Simulate slow processing
            setTimeout(() => {
                parentPort.postMessage({ success: true, result: 'slow result' });
            }, 1000);
        } else {
            parentPort.postMessage({ success: true, result: 'processed: ' + data });
        }
    }, 10);
});
`;

describe('WorkerPool', () => {
    let pool;
    
    before(async () => {
        // Create test worker file
        const fs = require('fs');
        const workerPath = path.join(__dirname, 'test-worker.js');
        fs.writeFileSync(workerPath, testWorkerCode);
    });
    
    after(async () => {
        // Clean up test worker file
        const fs = require('fs');
        const workerPath = path.join(__dirname, 'test-worker.js');
        try {
            fs.unlinkSync(workerPath);
        } catch (err) {
            // Ignore cleanup errors
        }
    });
    
    afterEach(async () => {
        // Close pool after each test
        if (pool) {
            await pool.close();
            pool = null;
        }
    });
    
    describe('initialization', () => {
        it('should create pool with default options', () => {
            pool = new WorkerPool({
                workerPath: path.join(__dirname, 'test-worker.js')
            });
            
            const stats = pool.getStats();
            assert.equal(stats.minWorkers, 2);
            assert.equal(stats.maxWorkers, 4);
            assert.equal(stats.totalWorkers, 2);
        });
        
        it('should create pool with custom options', () => {
            pool = new WorkerPool({
                workerPath: path.join(__dirname, 'test-worker.js'),
                minWorkers: 1,
                maxWorkers: 3,
                workerTimeout: 500,
                maxQueueSize: 50
            });
            
            const stats = pool.getStats();
            assert.equal(stats.minWorkers, 1);
            assert.equal(stats.maxWorkers, 3);
            assert.equal(stats.totalWorkers, 1);
        });
    });
    
    describe('task processing', () => {
        beforeEach(() => {
            pool = new WorkerPool({
                workerPath: path.join(__dirname, 'test-worker.js'),
                minWorkers: 2,
                maxWorkers: 4
            });
        });
        
        it('should process a single task', async () => {
            const result = await pool.process('test data');
            assert.equal(result, 'processed: test data');
        });
        
        it('should process multiple tasks sequentially', async () => {
            const result1 = await pool.process('task 1');
            const result2 = await pool.process('task 2');
            const result3 = await pool.process('task 3');
            
            assert.equal(result1, 'processed: task 1');
            assert.equal(result2, 'processed: task 2');
            assert.equal(result3, 'processed: task 3');
        });
        
        it('should process multiple tasks concurrently', async () => {
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(pool.process(`task ${i}`));
            }
            
            const results = await Promise.all(promises);
            
            assert.equal(results.length, 10);
            results.forEach((result, i) => {
                assert.equal(result, `processed: task ${i}`);
            });
        });
        
        it('should handle worker errors', async () => {
            try {
                await pool.process('error');
                assert.fail('Should have thrown an error');
            } catch (err) {
                assert.equal(err.message, 'Test error');
            }
        });
        
        it('should timeout long-running tasks', async () => {
            try {
                await pool.process('slow', { timeout: 100 });
                assert.fail('Should have timed out');
            } catch (err) {
                assert.ok(err.message.includes('timed out'));
            }
        });
    });
    
    describe('worker management', () => {
        beforeEach(() => {
            pool = new WorkerPool({
                workerPath: path.join(__dirname, 'test-worker.js'),
                minWorkers: 2,
                maxWorkers: 4
            });
        });
        
        it('should scale up workers under load', async () => {
            const initialStats = pool.getStats();
            assert.equal(initialStats.totalWorkers, 2);
            
            // Create enough concurrent tasks to trigger scaling
            const promises = [];
            for (let i = 0; i < 6; i++) {
                promises.push(pool.process(`task ${i}`));
            }
            
            // Check stats while processing
            await new Promise(resolve => setTimeout(resolve, 50));
            const midStats = pool.getStats();
            assert.ok(midStats.totalWorkers > 2);
            assert.ok(midStats.totalWorkers <= 4);
            
            await Promise.all(promises);
        });
        
        it('should reuse workers efficiently', async () => {
            const stats1 = pool.getStats();
            const initialWorkers = stats1.totalWorkers;
            
            // Process tasks that complete quickly
            const promises = [];
            for (let i = 0; i < 20; i++) {
                promises.push(pool.process(`quick ${i}`));
            }
            
            await Promise.all(promises);
            
            const stats2 = pool.getStats();
            // Should not have created too many workers
            assert.ok(stats2.totalWorkers <= 4);
        });
        
        it('should handle queue when at max workers', async () => {
            // Fill up all workers with slow tasks
            const slowPromises = [];
            for (let i = 0; i < 4; i++) {
                slowPromises.push(pool.process('slow'));
            }
            
            // These should queue
            const queuedPromises = [];
            for (let i = 0; i < 3; i++) {
                queuedPromises.push(pool.process(`queued ${i}`));
            }
            
            // Check that tasks are queued
            await new Promise(resolve => setTimeout(resolve, 50));
            const stats = pool.getStats();
            assert.ok(stats.queuedTasks > 0);
            
            // Wait for all to complete
            await Promise.all([...slowPromises, ...queuedPromises]);
        });
    });
    
    describe('pool lifecycle', () => {
        it('should close pool gracefully', async () => {
            pool = new WorkerPool({
                workerPath: path.join(__dirname, 'test-worker.js')
            });
            
            // Process some tasks
            await pool.process('test 1');
            await pool.process('test 2');
            
            // Close pool
            await pool.close();
            
            // Should not be able to process after closing
            try {
                await pool.process('after close');
                assert.fail('Should not process after closing');
            } catch (err) {
                assert.ok(err.message.includes('closing'));
            }
        });
        
        it('should handle closing with pending tasks', async () => {
            pool = new WorkerPool({
                workerPath: path.join(__dirname, 'test-worker.js')
            });
            
            // Start some tasks but don't wait
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(pool.process(`task ${i}`).catch(() => {}));
            }
            
            // Close immediately
            await pool.close();
            
            // Some tasks might fail, but close should complete
            assert.ok(true, 'Pool closed successfully');
        });
    });
    
    describe('statistics', () => {
        it('should provide accurate statistics', async () => {
            pool = new WorkerPool({
                workerPath: path.join(__dirname, 'test-worker.js'),
                minWorkers: 2,
                maxWorkers: 4
            });
            
            const stats1 = pool.getStats();
            assert.equal(stats1.totalWorkers, 2);
            assert.equal(stats1.busyWorkers, 0);
            assert.equal(stats1.freeWorkers, 2);
            assert.equal(stats1.queuedTasks, 0);
            
            // Start processing
            const promise = pool.process('test');
            
            // Check stats while processing
            await new Promise(resolve => setTimeout(resolve, 5));
            const stats2 = pool.getStats();
            assert.ok(stats2.busyWorkers > 0);
            
            await promise;
            
            // Check stats after completion
            const stats3 = pool.getStats();
            assert.equal(stats3.busyWorkers, 0);
            assert.equal(stats3.freeWorkers, stats3.totalWorkers);
        });
    });
});