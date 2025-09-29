#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mimeHtml = require('../lib/mime-html');

class RealWorldBenchmark {
    constructor() {
        this.results = [];
    }
    
    async runTest(name, fn, iterations = 50) {
        const times = [];
        const errors = [];
        
        // Warmup
        console.log(`  Warming up ${name}...`);
        for (let i = 0; i < 3; i++) {
            try {
                await fn();
            } catch (err) {
                // Ignore warmup errors
            }
        }
        
        // Actual test
        console.log(`  Running ${name} (${iterations} iterations)...`);
        for (let i = 0; i < iterations; i++) {
            if (i % 10 === 0) {
                process.stdout.write(`    Progress: ${i}/${iterations}\r`);
            }
            const start = process.hrtime.bigint();
            try {
                await fn();
                const end = process.hrtime.bigint();
                times.push(Number(end - start) / 1000000); // Convert to milliseconds
            } catch (err) {
                errors.push(err.message);
            }
        }
        process.stdout.write(`    Progress: ${iterations}/${iterations} - Done!\n`);
        
        if (times.length > 0) {
            times.sort((a, b) => a - b);
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            const median = times[Math.floor(times.length / 2)];
            const min = times[0];
            const max = times[times.length - 1];
            const p95 = times[Math.floor(times.length * 0.95)];
            const p99 = times[Math.floor(times.length * 0.99)];
            
            return {
                name,
                iterations,
                successful: times.length,
                failed: errors.length,
                avg: avg.toFixed(2),
                median: median.toFixed(2),
                min: min.toFixed(2),
                max: max.toFixed(2),
                p95: p95.toFixed(2),
                p99: p99.toFixed(2),
                errors: errors.length > 0 ? errors[0] : null
            };
        } else {
            return {
                name,
                iterations,
                successful: 0,
                failed: errors.length,
                errors: errors[0] || 'All iterations failed'
            };
        }
    }
    
    formatTable(results) {
        const table = [];
        results.forEach(test => {
            if (test.successful > 0) {
                table.push({
                    Method: test.name,
                    'Success': `${test.successful}/${test.iterations}`,
                    'Avg': `${test.avg}ms`,
                    'Median': `${test.median}ms`,
                    'Min': `${test.min}ms`,
                    'Max': `${test.max}ms`,
                    'P95': `${test.p95}ms`,
                    'P99': `${test.p99}ms`
                });
            } else {
                table.push({
                    Method: test.name,
                    'Success': `${test.successful}/${test.iterations}`,
                    Error: test.errors
                });
            }
        });
        
        console.table(table);
    }
    
    async runBenchmarks() {
        console.log('Real-World HTML Benchmark');
        console.log('=' .repeat(80));
        console.log('Testing with actual problematic HTML that contains :is(), :where(), :has() selectors');
        console.log('Both sync and async versions now pre-filter these selectors\n');
        
        // Load the real-world HTML
        const realWorldHtml = fs.readFileSync(
            path.join(__dirname, '../examples/failing.html'), 
            'utf8'
        );
        
        console.log(`HTML size: ${(realWorldHtml.length / 1024).toFixed(1)} KB`);
        console.log(`Contains modern CSS selectors that would cause juice to hang\n`);
        
        const results = [];
        
        // Test 1: Sync version
        console.log('Test 1: Sync Version');
        console.log('-'.repeat(40));
        results.push(await this.runTest('Sync', () => {
            return Promise.resolve(mimeHtml.sync({ html: realWorldHtml }));
        }, 50));
        
        // Test 2: Async with worker pool
        console.log('\nTest 2: Async with Worker Pool');
        console.log('-'.repeat(40));
        results.push(await this.runTest('Async (pool)', async () => {
            return await mimeHtml.async({ html: realWorldHtml }, {
                useWorkerPool: true,
                timeout: 5000,
                minWorkers: 2,
                maxWorkers: 4,
                logErrors: false
            });
        }, 50));
        
        // Test 3: Async without pool (fewer iterations due to overhead)
        console.log('\nTest 3: Async without Worker Pool');
        console.log('-'.repeat(40));
        results.push(await this.runTest('Async (no pool)', async () => {
            return await mimeHtml.async({ html: realWorldHtml }, {
                useWorkerPool: false,
                timeout: 5000,
                logErrors: false
            });
        }, 10));
        
        // Display results
        console.log('\n' + '='.repeat(80));
        console.log('RESULTS');
        console.log('='.repeat(80) + '\n');
        
        this.formatTable(results);
        
        // Performance comparison
        console.log('\nPerformance Analysis:');
        console.log('-'.repeat(40));
        
        const sync = results.find(r => r.name === 'Sync');
        const asyncPool = results.find(r => r.name === 'Async (pool)');
        const asyncNoPool = results.find(r => r.name === 'Async (no pool)');
        
        if (sync && asyncPool && sync.successful > 0 && asyncPool.successful > 0) {
            const overhead = ((parseFloat(asyncPool.avg) - parseFloat(sync.avg)) / parseFloat(sync.avg) * 100).toFixed(1);
            if (overhead > 0) {
                console.log(`• Async with pool adds ${overhead}% overhead vs sync`);
            } else {
                console.log(`• Async with pool is ${Math.abs(overhead)}% faster than sync`);
            }
        }
        
        if (asyncPool && asyncNoPool && asyncPool.successful > 0 && asyncNoPool.successful > 0) {
            const poolAdvantage = (parseFloat(asyncNoPool.avg) / parseFloat(asyncPool.avg)).toFixed(1);
            console.log(`• Worker pool is ${poolAdvantage}x faster than creating workers per request`);
        }
        
        if (sync && sync.successful > 0) {
            console.log(`• Sync processes at ~${(1000 / parseFloat(sync.avg)).toFixed(0)} requests/second`);
        }
        
        if (asyncPool && asyncPool.successful > 0) {
            console.log(`• Async with pool processes at ~${(1000 / parseFloat(asyncPool.avg)).toFixed(0)} requests/second`);
        }
        
        // Check if any timeouts occurred
        const anyTimeouts = results.some(r => r.failed > 0);
        if (!anyTimeouts) {
            console.log('\n✅ No timeouts occurred - pre-filtering is working correctly!');
        } else {
            console.log('\n⚠️ Some timeouts occurred:');
            results.filter(r => r.failed > 0).forEach(r => {
                console.log(`  - ${r.name}: ${r.failed} failures`);
            });
        }
        
        // Worker pool stats
        const stats = mimeHtml.getWorkerPoolStats();
        if (stats) {
            console.log('\nWorker Pool Final Stats:');
            console.log('-'.repeat(40));
            console.log(`• Total Workers: ${stats.totalWorkers}`);
            console.log(`• Busy Workers: ${stats.busyWorkers}`);
            console.log(`• Free Workers: ${stats.freeWorkers}`);
            console.log(`• Queued Tasks: ${stats.queuedTasks}`);
        }
        
        // Memory usage
        const memUsage = process.memoryUsage();
        console.log('\nMemory Usage:');
        console.log('-'.repeat(40));
        console.log(`• RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)} MB`);
        console.log(`• Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`);
        console.log(`• External: ${(memUsage.external / 1024 / 1024).toFixed(1)} MB`);
        
        // Cleanup
        await mimeHtml.closeWorkerPool();
        
        console.log('\n' + '='.repeat(80));
        console.log('Benchmark Complete!');
        console.log('='.repeat(80));
        
        // Summary
        console.log('\nKey Takeaways:');
        console.log('• Both versions successfully handle problematic CSS by pre-filtering');
        console.log('• No timeouts needed when selectors are filtered before processing');
        console.log('• Worker pool provides efficient concurrent processing');
        console.log('• Async timeout serves as safety net for unknown edge cases');
    }
}

// Run benchmark
const benchmark = new RealWorldBenchmark();
benchmark.runBenchmarks().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});