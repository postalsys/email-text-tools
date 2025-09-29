#!/usr/bin/env node
'use strict';

const mimeHtml = require('./lib/mime-html');

async function testSimple() {
    const simpleHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial; }
                p { color: blue; }
            </style>
        </head>
        <body>
            <h1>Test</h1>
            <p>Simple test email.</p>
        </body>
        </html>
    `;
    
    console.log('Testing 10 concurrent requests with simple HTML...\n');
    
    const start = Date.now();
    const promises = [];
    
    for (let i = 0; i < 10; i++) {
        promises.push(
            mimeHtml.async(
                { html: simpleHtml },
                {
                    useWorkerPool: true,
                    timeout: 5000,
                    logErrors: true
                }
            ).then(() => {
                console.log(`  Request ${i + 1} completed`);
                return i;
            }).catch(err => {
                console.log(`  Request ${i + 1} FAILED: ${err.message}`);
                throw err;
            })
        );
    }
    
    try {
        const results = await Promise.all(promises);
        const elapsed = Date.now() - start;
        console.log(`\n✓ All ${results.length} requests completed in ${elapsed}ms`);
    } catch (err) {
        console.log(`\n✗ Batch failed: ${err.message}`);
    }
    
    const stats = mimeHtml.getWorkerPoolStats();
    console.log('\nWorker pool stats:', stats);
    
    await mimeHtml.closeWorkerPool();
}

testSimple().catch(console.error);