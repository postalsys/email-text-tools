#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mimeHtml = require('./lib/mime-html');

async function testConcurrent() {
    console.log('Testing small concurrent batch...\n');
    
    const realWorldHtml = fs.readFileSync(
        path.join(__dirname, 'examples/failing.html'), 
        'utf8'
    );
    
    // Just test 5 concurrent requests
    console.log('Processing 5 concurrent requests...');
    const start = Date.now();
    
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(
            mimeHtml.async(
                { html: realWorldHtml },
                {
                    useWorkerPool: true,
                    timeout: 5000,
                    logErrors: false
                }
            ).then(() => {
                console.log(`  Request ${i + 1} completed`);
            })
        );
    }
    
    try {
        await Promise.all(promises);
        const elapsed = Date.now() - start;
        console.log(`\n✓ All requests completed in ${elapsed}ms`);
        console.log(`  Average: ${(elapsed / 5).toFixed(2)}ms per request`);
    } catch (err) {
        console.log(`\n✗ Failed: ${err.message}`);
    }
    
    await mimeHtml.closeWorkerPool();
}

testConcurrent().catch(console.error);