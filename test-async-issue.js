#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mimeHtml = require('./lib/mime-html');

async function testAsyncIssue() {
    console.log('Testing async version for issues...\n');
    
    const realWorldHtml = fs.readFileSync(
        path.join(__dirname, 'examples/failing.html'), 
        'utf8'
    );
    
    console.log('Test 1: Single async call with debug info');
    console.log('-'.repeat(40));
    
    try {
        console.log('Starting async processing...');
        const start = Date.now();
        
        const result = await mimeHtml.async(
            { html: realWorldHtml },
            {
                useWorkerPool: false,  // Try without pool first
                timeout: 3000,
                logErrors: true
            }
        );
        
        const elapsed = Date.now() - start;
        console.log(`✓ Completed in ${elapsed}ms`);
        console.log(`  Result length: ${result.length} chars`);
        
    } catch (err) {
        console.log(`✗ Failed: ${err.message}`);
    }
    
    console.log('\nTest 2: With worker pool');
    console.log('-'.repeat(40));
    
    try {
        console.log('Starting with worker pool...');
        const start = Date.now();
        
        const result = await mimeHtml.async(
            { html: realWorldHtml },
            {
                useWorkerPool: true,
                timeout: 3000,
                logErrors: true
            }
        );
        
        const elapsed = Date.now() - start;
        console.log(`✓ Completed in ${elapsed}ms`);
        console.log(`  Result length: ${result.length} chars`);
        
    } catch (err) {
        console.log(`✗ Failed: ${err.message}`);
    }
    
    // Check worker pool stats
    const stats = mimeHtml.getWorkerPoolStats();
    if (stats) {
        console.log('\nWorker pool stats:');
        console.log(`  Workers: ${stats.totalWorkers}`);
        console.log(`  Busy: ${stats.busyWorkers}`);
        console.log(`  Free: ${stats.freeWorkers}`);
    }
    
    await mimeHtml.closeWorkerPool();
    console.log('\nTest complete');
}

testAsyncIssue().catch(console.error);