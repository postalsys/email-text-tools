#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const mimeHtml = require('../lib/mime-html');

// Test data sets
const testCases = {
    simple: {
        name: 'Simple HTML',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial; }
                    p { color: blue; }
                </style>
            </head>
            <body>
                <h1>Hello World</h1>
                <p>This is a simple test email.</p>
            </body>
            </html>
        `
    },
    
    moderate: {
        name: 'Moderate HTML with inline styles',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; background: #f0f0f0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    h1 { color: #333; border-bottom: 2px solid #007bff; }
                    p { line-height: 1.6; color: #666; }
                    .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; }
                    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Newsletter Title</h1>
                    <p>This is a moderately complex email template with various styles.</p>
                    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                    <a href="#" class="button">Call to Action</a>
                    <div class="footer">
                        <p>Footer content here</p>
                    </div>
                </div>
            </body>
            </html>
        `
    },
    
    complex: {
        name: 'Complex HTML with media queries',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; }
                    .wrapper { max-width: 600px; margin: 0 auto; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; }
                    .header h1 { color: white; font-size: 32px; }
                    .content { padding: 40px 20px; background: white; }
                    .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
                    .card h2 { color: #333; margin-bottom: 10px; }
                    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
                    @media only screen and (max-width: 600px) {
                        .grid { grid-template-columns: 1fr; }
                        .header h1 { font-size: 24px; }
                    }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                    .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
                    .footer { background: #f8f9fa; padding: 30px 20px; text-align: center; color: #6c757d; }
                </style>
            </head>
            <body>
                <div class="wrapper">
                    <div class="header">
                        <h1>Complex Email Template</h1>
                    </div>
                    <div class="content">
                        <div class="card">
                            <h2>Feature One</h2>
                            <p>Description of the first feature with detailed information.</p>
                        </div>
                        <div class="grid">
                            <div class="card">
                                <h2>Item 1</h2>
                                <p>Grid item content</p>
                            </div>
                            <div class="card">
                                <h2>Item 2</h2>
                                <p>Grid item content</p>
                            </div>
                        </div>
                        <table>
                            <tr><th>Product</th><th>Price</th><th>Quantity</th></tr>
                            <tr><td>Item A</td><td>$10</td><td>2</td></tr>
                            <tr><td>Item B</td><td>$20</td><td>1</td></tr>
                        </table>
                        <a href="#" class="button">Shop Now</a>
                    </div>
                    <div class="footer">
                        <p>Copyright 2024. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    },
    
    problematic: {
        name: 'HTML with problematic CSS (modern selectors)',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: system-ui, sans-serif; }
                    /* Modern CSS that might cause issues */
                    .container:is(.active, .highlighted) { background: yellow; }
                    .item:where(.primary) { color: blue; }
                    .parent:has(> .child) { border: 1px solid red; }
                    /* Standard CSS */
                    h1 { color: #333; }
                    p { line-height: 1.6; }
                    .box:not(.special) { padding: 10px; }
                </style>
            </head>
            <body>
                <div class="container active">
                    <h1>Test with Modern CSS</h1>
                    <div class="parent">
                        <div class="child">Child element</div>
                    </div>
                    <p class="item primary">This uses modern selectors</p>
                    <div class="box">Regular box</div>
                    <div class="box special">Special box</div>
                </div>
            </body>
            </html>
        `
    }
};

// Load the failing.html if it exists
try {
    const failingHtml = fs.readFileSync(path.join(__dirname, '../examples/failing.html'), 'utf8');
    testCases.realWorld = {
        name: 'Real-world problematic HTML',
        html: failingHtml
    };
} catch (err) {
    // File doesn't exist, skip it
}

// Benchmark runner
class Benchmark {
    constructor() {
        this.results = [];
    }
    
    async runTest(name, fn, iterations = 100) {
        const times = [];
        const errors = [];
        
        // Warmup
        for (let i = 0; i < 5; i++) {
            try {
                await fn();
            } catch (err) {
                // Ignore warmup errors
            }
        }
        
        // Actual test
        for (let i = 0; i < iterations; i++) {
            const start = process.hrtime.bigint();
            try {
                await fn();
                const end = process.hrtime.bigint();
                times.push(Number(end - start) / 1000000); // Convert to milliseconds
            } catch (err) {
                errors.push(err.message);
            }
        }
        
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
    
    formatResults(results) {
        console.log('\n' + '='.repeat(80));
        console.log(`Test Case: ${results.testCase}`);
        console.log('='.repeat(80));
        
        const table = [];
        results.tests.forEach(test => {
            if (test.successful > 0) {
                table.push({
                    Method: test.name,
                    'Success Rate': `${test.successful}/${test.iterations}`,
                    'Avg (ms)': test.avg,
                    'Median (ms)': test.median,
                    'Min (ms)': test.min,
                    'Max (ms)': test.max,
                    'P95 (ms)': test.p95,
                    'P99 (ms)': test.p99
                });
            } else {
                table.push({
                    Method: test.name,
                    'Success Rate': `${test.successful}/${test.iterations}`,
                    Error: test.errors
                });
            }
        });
        
        console.table(table);
        
        // Calculate speedup if both succeeded
        const syncTest = results.tests.find(t => t.name === 'Sync');
        const asyncTest = results.tests.find(t => t.name === 'Async (with pool)');
        
        if (syncTest && asyncTest && syncTest.successful > 0 && asyncTest.successful > 0) {
            const speedup = (parseFloat(syncTest.avg) / parseFloat(asyncTest.avg)).toFixed(2);
            if (speedup > 1) {
                console.log(`\nAsync is ${speedup}x faster than Sync`);
            } else {
                console.log(`\nSync is ${(1/speedup).toFixed(2)}x faster than Async`);
            }
        }
    }
    
    async runBenchmarks() {
        console.log('Starting Mime HTML Benchmarks...');
        console.log('================================\n');
        
        for (const [key, testCase] of Object.entries(testCases)) {
            const results = {
                testCase: testCase.name,
                tests: []
            };
            
            // Test sync version
            results.tests.push(await this.runTest('Sync', () => {
                return Promise.resolve(mimeHtml.sync({ html: testCase.html }));
            }, 100));
            
            // Test async version with pool
            results.tests.push(await this.runTest('Async (with pool)', async () => {
                return await mimeHtml.async({ html: testCase.html }, {
                    useWorkerPool: true,
                    timeout: 5000,
                    minWorkers: 2,
                    maxWorkers: 4
                });
            }, 100));
            
            // Test async version without pool
            results.tests.push(await this.runTest('Async (no pool)', async () => {
                return await mimeHtml.async({ html: testCase.html }, {
                    useWorkerPool: false,
                    timeout: 5000
                });
            }, 100));
            
            this.formatResults(results);
        }
        
        // Show worker pool stats
        const stats = mimeHtml.getWorkerPoolStats();
        if (stats) {
            console.log('\n' + '='.repeat(80));
            console.log('Worker Pool Stats:');
            console.log('='.repeat(80));
            console.table([stats]);
        }
        
        // Clean up
        await mimeHtml.closeWorkerPool();
    }
}

// Run benchmarks
const benchmark = new Benchmark();
benchmark.runBenchmarks().then(() => {
    console.log('\nBenchmark complete!');
    process.exit(0);
}).catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});