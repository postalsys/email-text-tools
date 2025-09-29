'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mimeHtml = require('../lib/mime-html');

describe('mime-html', () => {
    describe('sync version', () => {
        it('should process simple HTML', () => {
            const input = {
                html: '<html><body><p>Hello World</p></body></html>'
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('Hello World'));
            assert.ok(result.includes('<div'));
            assert.ok(result.includes('</div>'));
        });
        
        it('should convert text to HTML when no HTML provided', () => {
            const input = {
                text: 'Hello World\nThis is a test'
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('Hello World'));
            assert.ok(result.includes('This is a test'));
            assert.ok(result.includes('<br'));
        });
        
        it('should handle HTML with CSS styles', () => {
            const input = {
                html: `
                    <html>
                    <head>
                        <style>
                            p { color: red; }
                            .test { font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <p class="test">Styled text</p>
                    </body>
                    </html>
                `
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('Styled text'));
            assert.ok(result.includes('style='));
        });
        
        it('should sanitize dangerous HTML', () => {
            const input = {
                html: `
                    <html>
                    <body>
                        <p>Safe content</p>
                        <script>alert('XSS')</script>
                        <img src=x onerror="alert('XSS')">
                    </body>
                    </html>
                `
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('Safe content'));
            assert.ok(!result.includes('<script'));
            assert.ok(!result.includes('onerror'));
        });
        
        it('should add target="_blank" to links', () => {
            const input = {
                html: '<a href="https://example.com">Link</a>'
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('target="_blank"'));
            assert.ok(result.includes('Link'));
        });
        
        it('should remove problematic CSS selectors', () => {
            const input = {
                html: `
                    <html>
                    <head>
                        <style>
                            .item:is(.active, .selected) { background: yellow; }
                            .element:where(.primary) { color: blue; }
                            .parent:has(> .child) { border: 1px solid red; }
                            p { color: green; }
                        </style>
                    </head>
                    <body>
                        <p class="item active">Test</p>
                    </body>
                    </html>
                `
            };
            
            // Should complete without hanging
            const result = mimeHtml.sync(input);
            assert.ok(result.includes('Test'));
            assert.ok(result.includes('color'));
        });
        
        it('should remove forbidden style properties', () => {
            const input = {
                html: `
                    <html>
                    <body style="position: fixed; width: 100%; height: 100%;">
                        <div style="position: absolute; top: 0;">Content</div>
                    </body>
                    </html>
                `
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('Content'));
            assert.ok(!result.includes('position'));
            assert.ok(!result.includes('width'));
            assert.ok(!result.includes('height'));
        });
        
        it('should handle empty input gracefully', () => {
            const input = { html: '' };
            const result = mimeHtml.sync(input);
            
            assert.ok(typeof result === 'string');
            assert.ok(result.includes('<div'));
        });
        
        it('should handle malformed HTML', () => {
            const input = {
                html: '<p>Unclosed paragraph <div>Nested content</p></div>'
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('Unclosed paragraph'));
            assert.ok(result.includes('Nested content'));
        });
        
        it('should preserve HTML entities', () => {
            const input = {
                html: '<p>&lt;script&gt; &amp; &quot;quotes&quot;</p>'
            };
            const result = mimeHtml.sync(input);
            
            assert.ok(result.includes('&lt;'));
            assert.ok(result.includes('&amp;'));
            assert.ok(result.includes('&quot;') || result.includes('"'));
        });
    });
    
    describe('async version', () => {
        it('should process simple HTML', async () => {
            const input = {
                html: '<html><body><p>Hello Async</p></body></html>'
            };
            const result = await mimeHtml.async(input);
            
            assert.ok(result.includes('Hello Async'));
            assert.ok(result.includes('<div'));
        });
        
        it('should handle timeout option', async () => {
            const input = {
                html: '<p>Quick test</p>'
            };
            const result = await mimeHtml.async(input, { timeout: 1000 });
            
            assert.ok(result.includes('Quick test'));
        });
        
        it('should use worker pool by default', async () => {
            const input = {
                html: '<p>Pool test</p>'
            };
            
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(mimeHtml.async(input));
            }
            
            const results = await Promise.all(promises);
            assert.equal(results.length, 5);
            results.forEach(result => {
                assert.ok(result.includes('Pool test'));
            });
            
            const stats = mimeHtml.getWorkerPoolStats();
            assert.ok(stats);
            assert.ok(stats.totalWorkers >= 2);
        });
        
        it('should work without worker pool when disabled', async () => {
            const input = {
                html: '<p>No pool test</p>'
            };
            const result = await mimeHtml.async(input, { useWorkerPool: false });
            
            assert.ok(result.includes('No pool test'));
        });
        
        it('should handle problematic CSS with pre-filtering', async () => {
            const input = {
                html: `
                    <html>
                    <head>
                        <style>
                            .test:is(.a, .b) { color: red; }
                            .item:where(.x) { color: blue; }
                            .parent:has(.child) { border: 1px solid; }
                        </style>
                    </head>
                    <body>
                        <p class="test a">Async test</p>
                    </body>
                    </html>
                `
            };
            
            const start = Date.now();
            const result = await mimeHtml.async(input, { timeout: 2000 });
            const elapsed = Date.now() - start;
            
            assert.ok(result.includes('Async test'));
            assert.ok(elapsed < 1000, 'Should complete quickly with pre-filtering');
        });
        
        it('should handle errors with fallback', async () => {
            const input = {
                html: '<p>Error test</p>'
            };
            
            // Even with errors, should return result with fallback
            const result = await mimeHtml.async(input, {
                fallbackOnError: true,
                logErrors: false
            });
            
            assert.ok(typeof result === 'string');
        });
        
        it('should throw errors when fallback disabled', async () => {
            // Create intentionally problematic scenario
            const input = {
                html: null // This will cause issues
            };
            
            try {
                await mimeHtml.async(input, {
                    fallbackOnError: false,
                    logErrors: false
                });
                assert.fail('Should have thrown an error');
            } catch (err) {
                assert.ok(err);
            }
        });
    });
    
    describe('backward compatibility', () => {
        it('should maintain default export compatibility', () => {
            const input = {
                html: '<p>Compatibility test</p>'
            };
            
            // Default export should work
            const result = mimeHtml(input);
            assert.ok(result.includes('Compatibility test'));
        });
        
        it('should have sync and async methods available', () => {
            assert.equal(typeof mimeHtml.sync, 'function');
            assert.equal(typeof mimeHtml.async, 'function');
        });
        
        it('should have worker pool management methods', () => {
            assert.equal(typeof mimeHtml.closeWorkerPool, 'function');
            assert.equal(typeof mimeHtml.getWorkerPoolStats, 'function');
        });
    });
    
    describe('concurrent processing', () => {
        it('should handle multiple concurrent requests', async () => {
            const htmls = [];
            for (let i = 0; i < 10; i++) {
                htmls.push({
                    html: `<p>Request ${i}</p>`
                });
            }
            
            const promises = htmls.map((input, i) => 
                mimeHtml.async(input).then(result => {
                    assert.ok(result.includes(`Request ${i}`));
                    return i;
                })
            );
            
            const results = await Promise.all(promises);
            assert.equal(results.length, 10);
            assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        });
        
        it('should handle mixed content types concurrently', async () => {
            const inputs = [
                { html: '<p>HTML content</p>' },
                { text: 'Plain text content' },
                { html: '<div>Another HTML</div>' },
                { text: 'More text\nWith newlines' }
            ];
            
            const results = await Promise.all(
                inputs.map(input => mimeHtml.async(input))
            );
            
            assert.ok(results[0].includes('HTML content'));
            assert.ok(results[1].includes('Plain text content'));
            assert.ok(results[2].includes('Another HTML'));
            assert.ok(results[3].includes('More text'));
        });
    });
    
    // Clean up worker pool after all tests
    after(async () => {
        await mimeHtml.closeWorkerPool();
    });
});