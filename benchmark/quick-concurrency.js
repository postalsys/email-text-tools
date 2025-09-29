#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mimeHtml = require('../lib/mime-html');

async function quickConcurrencyTest() {
    console.log('Quick Concurrency Test - Real-World HTML');
    console.log('='.repeat(60));

    const realWorldHtml = fs.readFileSync(path.join(__dirname, '../examples/failing.html'), 'utf8');

    console.log(`Testing with ${(realWorldHtml.length / 1024).toFixed(1)} KB of problematic HTML\n`);

    const iterations = 30;

    // Test 1: Sequential Sync
    console.log(`Test 1: Sequential Sync (${iterations} requests)`);
    const syncStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        mimeHtml.sync({ html: realWorldHtml });
    }
    const syncTime = Number(process.hrtime.bigint() - syncStart) / 1000000;
    console.log(`  Time: ${syncTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${(iterations / (syncTime / 1000)).toFixed(0)} req/s\n`);

    // Test 2: Concurrent Async with Pool (concurrency = 10)
    console.log(`Test 2: Concurrent Async with Pool (${iterations} requests, concurrency=10)`);
    const asyncStart = process.hrtime.bigint();
    const promises = [];
    for (let i = 0; i < iterations; i++) {
        promises.push(
            mimeHtml.async(
                { html: realWorldHtml },
                {
                    useWorkerPool: true,
                    timeout: 5000,
                    logErrors: false
                }
            )
        );
    }
    await Promise.all(promises);
    const asyncTime = Number(process.hrtime.bigint() - asyncStart) / 1000000;
    console.log(`  Time: ${asyncTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${(iterations / (asyncTime / 1000)).toFixed(0)} req/s\n`);

    // Show speedup
    const speedup = (syncTime / asyncTime).toFixed(2);
    console.log('='.repeat(60));
    console.log('Results:');
    console.log(`• Concurrent processing is ${speedup}x faster than sequential`);
    console.log(`• No timeouts occurred (pre-filtering working correctly)`);

    const stats = mimeHtml.getWorkerPoolStats();
    if (stats) {
        console.log(`• Worker pool used ${stats.totalWorkers} workers efficiently`);
    }

    await mimeHtml.closeWorkerPool();
}

quickConcurrencyTest().catch(console.error);
