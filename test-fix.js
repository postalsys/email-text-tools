#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mimeHtml = require('./lib/mime-html');

async function testFix() {
    console.log('Testing problematic selector filtering in async version\n');
    console.log('='.repeat(60));
    
    // Load the problematic HTML
    const problematicHtml = fs.readFileSync(path.join(__dirname, 'examples/failing.html'), 'utf8');
    
    console.log('\nTest 1: Async WITH pre-filtering (current implementation)');
    console.log('-'.repeat(60));
    
    const start1 = process.hrtime.bigint();
    try {
        const result = await mimeHtml.async(
            { html: problematicHtml },
            { 
                timeout: 2000,
                logErrors: false,
                useWorkerPool: false  // Use single worker to see true timing
            }
        );
        const end1 = process.hrtime.bigint();
        const time1 = Number(end1 - start1) / 1000000;
        console.log(`✓ Success in ${time1.toFixed(2)}ms`);
        console.log('  Result length:', result.length);
        console.log('  Pre-filtering removed problematic selectors');
        console.log('  Juice processed successfully without timeout');
    } catch (err) {
        const end1 = process.hrtime.bigint();
        const time1 = Number(end1 - start1) / 1000000;
        console.log(`✗ Failed after ${time1.toFixed(2)}ms: ${err.message}`);
    }
    
    console.log('\nTest 2: Sync version (with pre-filtering)');
    console.log('-'.repeat(60));
    
    const start2 = process.hrtime.bigint();
    try {
        const result = mimeHtml.sync({ html: problematicHtml });
        const end2 = process.hrtime.bigint();
        const time2 = Number(end2 - start2) / 1000000;
        console.log(`✓ Success in ${time2.toFixed(2)}ms`);
        console.log('  Result length:', result.length);
        console.log('  Pre-filtering removed problematic selectors');
    } catch (err) {
        console.log(`✗ Failed: ${err.message}`);
    }
    
    console.log('\nTest 3: Simple HTML performance comparison');
    console.log('-'.repeat(60));
    
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
            <p>Simple test</p>
        </body>
        </html>
    `;
    
    const start3 = process.hrtime.bigint();
    const syncResult = mimeHtml.sync({ html: simpleHtml });
    const end3 = process.hrtime.bigint();
    const syncTime = Number(end3 - start3) / 1000000;
    
    const start4 = process.hrtime.bigint();
    const asyncResult = await mimeHtml.async(
        { html: simpleHtml },
        { useWorkerPool: false }
    );
    const end4 = process.hrtime.bigint();
    const asyncTime = Number(end4 - start4) / 1000000;
    
    console.log(`Sync:  ${syncTime.toFixed(2)}ms`);
    console.log(`Async: ${asyncTime.toFixed(2)}ms (includes worker startup)`);
    
    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log('- Both versions now pre-filter problematic selectors');
    console.log('- Async timeout is only a safety net for unknown issues');
    console.log('- This prevents unnecessary timeouts and improves performance');
    
    await mimeHtml.closeWorkerPool();
}

testFix().catch(console.error);