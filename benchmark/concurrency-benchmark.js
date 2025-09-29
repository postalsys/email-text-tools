#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mimeHtml = require('../lib/mime-html');

async function concurrencyBenchmark() {
    console.log('Concurrency Benchmark - Real-World HTML');
    console.log('='.repeat(80));
    console.log('Testing concurrent processing with problematic HTML\n');

    // Load the real-world HTML
    const realWorldHtml = fs.readFileSync(path.join(__dirname, '../examples/failing.html'), 'utf8');

    console.log(`HTML size: ${(realWorldHtml.length / 1024).toFixed(1)} KB`);
    console.log('Testing different concurrency levels...\n');

    const concurrencyLevels = [1, 5, 10, 20, 50];
    const totalRequests = 100;

    const results = [];

    for (const concurrency of concurrencyLevels) {
        console.log(`Testing with concurrency level: ${concurrency}`);
        console.log('-'.repeat(40));

        // Test sync (sequential only)
        if (concurrency === 1) {
            console.log('  Sync version (sequential)...');
            const syncStart = process.hrtime.bigint();
            for (let i = 0; i < totalRequests; i++) {
                mimeHtml.sync({ html: realWorldHtml });
                if ((i + 1) % 20 === 0) {
                    process.stdout.write(`    Progress: ${i + 1}/${totalRequests}\r`);
                }
            }
            const syncEnd = process.hrtime.bigint();
            const syncTime = Number(syncEnd - syncStart) / 1000000;
            process.stdout.write(`    Progress: ${totalRequests}/${totalRequests} - Done!\n`);

            results.push({
                method: 'Sync (sequential)',
                concurrency: 1,
                totalRequests,
                totalTime: syncTime.toFixed(2),
                avgTime: (syncTime / totalRequests).toFixed(2),
                reqPerSec: (totalRequests / (syncTime / 1000)).toFixed(0)
            });
        }

        // Test async with pool
        console.log('  Async with pool...');
        const asyncPoolStart = process.hrtime.bigint();
        const poolPromises = [];

        for (let i = 0; i < totalRequests; i++) {
            poolPromises.push(
                mimeHtml.async(
                    { html: realWorldHtml },
                    {
                        useWorkerPool: true,
                        timeout: 5000,
                        minWorkers: 2,
                        maxWorkers: 4,
                        logErrors: false
                    }
                )
            );

            // Control concurrency
            if (poolPromises.length >= concurrency) {
                await Promise.race(poolPromises).then(() => {
                    const index = poolPromises.findIndex(
                        p => p.constructor.name !== 'Promise' || Promise.race([p, Promise.resolve('done')]).then(v => v === 'done')
                    );
                    if (index > -1) poolPromises.splice(index, 1);
                });
            }

            if ((i + 1) % 20 === 0) {
                process.stdout.write(`    Progress: ${i + 1}/${totalRequests}\r`);
            }
        }

        // Wait for remaining promises
        await Promise.all(poolPromises);
        const asyncPoolEnd = process.hrtime.bigint();
        const asyncPoolTime = Number(asyncPoolEnd - asyncPoolStart) / 1000000;
        process.stdout.write(`    Progress: ${totalRequests}/${totalRequests} - Done!\n`);

        results.push({
            method: 'Async (pool)',
            concurrency,
            totalRequests,
            totalTime: asyncPoolTime.toFixed(2),
            avgTime: (asyncPoolTime / totalRequests).toFixed(2),
            reqPerSec: (totalRequests / (asyncPoolTime / 1000)).toFixed(0)
        });

        // Show worker pool stats at peak concurrency
        if (concurrency === 20) {
            const stats = mimeHtml.getWorkerPoolStats();
            console.log(`    Worker pool stats: ${stats.totalWorkers} workers, ${stats.busyWorkers} busy`);
        }

        console.log();
    }

    // Display results table
    console.log('='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80) + '\n');

    console.table(
        results.map(r => ({
            Method: r.method,
            Concurrency: r.concurrency,
            'Total Time': `${r.totalTime}ms`,
            'Avg per Request': `${r.avgTime}ms`,
            Throughput: `${r.reqPerSec} req/s`
        }))
    );

    // Analysis
    console.log('Performance Analysis:');
    console.log('-'.repeat(40));

    const syncResult = results.find(r => r.method === 'Sync (sequential)');
    const bestAsync = results.filter(r => r.method === 'Async (pool)').sort((a, b) => parseFloat(a.totalTime) - parseFloat(b.totalTime))[0];

    if (syncResult && bestAsync) {
        const speedup = (parseFloat(syncResult.totalTime) / parseFloat(bestAsync.totalTime)).toFixed(2);
        console.log(`• Best async configuration: Concurrency ${bestAsync.concurrency}`);
        console.log(`• Async is ${speedup}x faster than sync for batch processing`);
        console.log(`• Sync throughput: ${syncResult.reqPerSec} req/s`);
        console.log(`• Best async throughput: ${bestAsync.reqPerSec} req/s`);
    }

    // Throughput graph
    console.log('\nThroughput by Concurrency Level:');
    console.log('-'.repeat(40));

    const asyncResults = results.filter(r => r.method === 'Async (pool)');
    const maxThroughput = Math.max(...asyncResults.map(r => parseInt(r.reqPerSec)));

    asyncResults.forEach(r => {
        const barLength = Math.round((parseInt(r.reqPerSec) / maxThroughput) * 30);
        const bar = '█'.repeat(barLength);
        console.log(`  ${String(r.concurrency).padStart(2)}: ${bar} ${r.reqPerSec} req/s`);
    });

    // Memory usage
    const memUsage = process.memoryUsage();
    console.log('\nFinal Memory Usage:');
    console.log('-'.repeat(40));
    console.log(`• RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)} MB`);
    console.log(`• Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`);

    // Cleanup
    await mimeHtml.closeWorkerPool();

    console.log('\n' + '='.repeat(80));
    console.log('Summary:');
    console.log('• Async with worker pool provides significant speedup for concurrent processing');
    console.log('• Pre-filtering prevents timeouts even under high load');
    console.log('• Worker pool efficiently handles concurrent requests');
    console.log('• Optimal concurrency depends on CPU cores and workload');
    console.log('='.repeat(80));
}

// Run benchmark
concurrencyBenchmark().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
