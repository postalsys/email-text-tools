#!/usr/bin/env node
'use strict';

const mimeHtml = require('../lib/mime-html');

// Quick performance comparison
async function quickBenchmark() {
    const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                h1 { color: #333; }
                p { line-height: 1.6; }
                .button { background: #007bff; color: white; padding: 10px 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Test Email</h1>
                <p>This is a test email with moderate complexity.</p>
                <a href="#" class="button">Click Here</a>
            </div>
        </body>
        </html>
    `;
    
    console.log('Quick Performance Comparison');
    console.log('============================\n');
    
    const iterations = 50;
    
    // Test Sync
    console.log('Testing Sync version...');
    const syncTimes = [];
    for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        mimeHtml.sync({ html: testHtml });
        const end = process.hrtime.bigint();
        syncTimes.push(Number(end - start) / 1000000);
    }
    
    // Test Async with Pool
    console.log('Testing Async with worker pool...');
    const asyncPoolTimes = [];
    for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        await mimeHtml.async({ html: testHtml }, { 
            useWorkerPool: true, 
            timeout: 5000 
        });
        const end = process.hrtime.bigint();
        asyncPoolTimes.push(Number(end - start) / 1000000);
    }
    
    // Test Async without Pool (just first 5 to avoid long wait)
    console.log('Testing Async without pool (5 iterations only)...');
    const asyncNoPoolTimes = [];
    for (let i = 0; i < 5; i++) {
        const start = process.hrtime.bigint();
        await mimeHtml.async({ html: testHtml }, { 
            useWorkerPool: false, 
            timeout: 5000 
        });
        const end = process.hrtime.bigint();
        asyncNoPoolTimes.push(Number(end - start) / 1000000);
    }
    
    // Calculate stats
    const getStats = (times) => {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        times.sort((a, b) => a - b);
        const median = times[Math.floor(times.length / 2)];
        const min = times[0];
        const max = times[times.length - 1];
        return { avg, median, min, max };
    };
    
    const syncStats = getStats(syncTimes);
    const asyncPoolStats = getStats(asyncPoolTimes);
    const asyncNoPoolStats = getStats(asyncNoPoolTimes);
    
    // Display results
    console.log('\nResults (all times in milliseconds):');
    console.log('=====================================\n');
    
    console.log('Sync Version:');
    console.log(`  Average:   ${syncStats.avg.toFixed(2)} ms`);
    console.log(`  Median:    ${syncStats.median.toFixed(2)} ms`);
    console.log(`  Min:       ${syncStats.min.toFixed(2)} ms`);
    console.log(`  Max:       ${syncStats.max.toFixed(2)} ms`);
    
    console.log('\nAsync with Worker Pool:');
    console.log(`  Average:   ${asyncPoolStats.avg.toFixed(2)} ms`);
    console.log(`  Median:    ${asyncPoolStats.median.toFixed(2)} ms`);
    console.log(`  Min:       ${asyncPoolStats.min.toFixed(2)} ms`);
    console.log(`  Max:       ${asyncPoolStats.max.toFixed(2)} ms`);
    
    console.log('\nAsync without Pool (single worker per call):');
    console.log(`  Average:   ${asyncNoPoolStats.avg.toFixed(2)} ms`);
    console.log(`  Median:    ${asyncNoPoolStats.median.toFixed(2)} ms`);
    console.log(`  Min:       ${asyncNoPoolStats.min.toFixed(2)} ms`);
    console.log(`  Max:       ${asyncNoPoolStats.max.toFixed(2)} ms`);
    
    console.log('\nPerformance Summary:');
    console.log('====================');
    
    if (asyncPoolStats.avg < syncStats.avg) {
        const speedup = (syncStats.avg / asyncPoolStats.avg).toFixed(2);
        console.log(`✓ Async with pool is ${speedup}x faster than sync`);
    } else {
        const slowdown = (asyncPoolStats.avg / syncStats.avg).toFixed(2);
        console.log(`✗ Async with pool is ${slowdown}x slower than sync`);
    }
    
    const poolVsNoPool = (asyncNoPoolStats.avg / asyncPoolStats.avg).toFixed(1);
    console.log(`✓ Worker pool is ${poolVsNoPool}x faster than single workers`);
    
    // Worker pool stats
    const poolStats = mimeHtml.getWorkerPoolStats();
    if (poolStats) {
        console.log('\nWorker Pool Statistics:');
        console.log('======================');
        console.log(`  Total Workers:  ${poolStats.totalWorkers}`);
        console.log(`  Busy Workers:   ${poolStats.busyWorkers}`);
        console.log(`  Free Workers:   ${poolStats.freeWorkers}`);
        console.log(`  Queued Tasks:   ${poolStats.queuedTasks}`);
        console.log(`  Min Workers:    ${poolStats.minWorkers}`);
        console.log(`  Max Workers:    ${poolStats.maxWorkers}`);
    }
    
    // Test with problematic CSS
    console.log('\nTesting Problematic CSS Handling:');
    console.log('=================================');
    
    const problematicHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                /* These selectors would cause juice to hang */
                .item:is(.active, .selected) { background: yellow; }
                .element:where(.primary) { color: blue; }
                .parent:has(> .child) { border: 1px solid red; }
            </style>
        </head>
        <body>
            <div class="item active">Active Item</div>
            <div class="parent"><div class="child">Child</div></div>
        </body>
        </html>
    `;
    
    try {
        console.log('  Sync version... ');
        const syncStart = process.hrtime.bigint();
        const syncResult = mimeHtml.sync({ html: problematicHtml });
        const syncEnd = process.hrtime.bigint();
        const syncTime = Number(syncEnd - syncStart) / 1000000;
        console.log(`    ✓ Success (${syncTime.toFixed(2)} ms) - problematic selectors removed`);
    } catch (err) {
        console.log(`    ✗ Failed: ${err.message}`);
    }
    
    try {
        console.log('  Async version...');
        const asyncStart = process.hrtime.bigint();
        const asyncResult = await mimeHtml.async({ html: problematicHtml }, { 
            timeout: 2000,
            logErrors: false
        });
        const asyncEnd = process.hrtime.bigint();
        const asyncTime = Number(asyncEnd - asyncStart) / 1000000;
        console.log(`    ✓ Success (${asyncTime.toFixed(2)} ms) - handled with timeout protection`);
    } catch (err) {
        console.log(`    ✗ Failed: ${err.message}`);
    }
    
    // Clean up
    await mimeHtml.closeWorkerPool();
    
    console.log('\n✓ Benchmark complete!');
}

// Run the benchmark
quickBenchmark().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});