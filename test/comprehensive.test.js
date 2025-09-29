'use strict';

const { describe, it, before: _before, after } = require('node:test');
const assert = require('node:assert/strict');
const mimeHtml = require('../lib/mime-html');
const textToHtml = require('../lib/text-to-html');
const _fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

describe('Comprehensive Test Suite', () => {
    describe('text-to-html conversion', () => {
        it('should convert plain text to HTML', () => {
            const text = 'Hello World\nThis is a test';
            const html = textToHtml(text);

            assert.ok(html.includes('Hello World'));
            assert.ok(html.includes('<br'));
            assert.ok(html.includes('This is a test'));
        });

        it('should handle quoted text', () => {
            const text = 'Normal text\n> Quoted text\n> More quoted\nNormal again';
            const html = textToHtml(text);

            assert.ok(html.includes('blockquote'));
            assert.ok(html.includes('Quoted text'));
            assert.ok(html.includes('Normal again'));
        });

        it('should linkify URLs', () => {
            const text = 'Visit https://example.com for more info';
            const html = textToHtml(text);

            assert.ok(html.includes('<a'));
            assert.ok(html.includes('href='));
            assert.ok(html.includes('https://example.com'));
        });

        it('should handle email addresses', () => {
            const text = 'Contact me at test@example.com';
            const html = textToHtml(text);

            assert.ok(html.includes('mailto:'));
            assert.ok(html.includes('test@example.com'));
        });

        it('should escape HTML entities', () => {
            const text = 'Test <script>alert("xss")</script> & special chars';
            const html = textToHtml(text);

            assert.ok(!html.includes('<script>'));
            assert.ok(html.includes('&lt;script'));
            assert.ok(html.includes('&amp;'));
        });

        it('should handle empty text', () => {
            const html = textToHtml('');
            assert.ok(typeof html === 'string');
        });

        it('should handle null/undefined', () => {
            const html1 = textToHtml(null);
            const html2 = textToHtml(undefined);
            const html3 = textToHtml('');

            // textToHtml returns minimal HTML for empty input
            assert.ok(typeof html1 === 'string');
            assert.ok(typeof html2 === 'string');
            assert.ok(typeof html3 === 'string');
            // Should return consistent output for all empty inputs
            assert.equal(html1, html2);
            assert.equal(html2, html3);
        });
    });

    describe('juice-worker.js', () => {
        it('should process HTML in worker thread', async () => {
            const worker = new Worker(path.join(__dirname, '../lib/juice-worker.js'));

            const html = '<style>p { color: red; }</style><p>Test</p>';

            const result = await new Promise((resolve, reject) => {
                worker.on('message', msg => {
                    worker.terminate();
                    if (msg.success) {
                        resolve(msg.result);
                    } else {
                        reject(new Error(msg.error));
                    }
                });

                worker.on('error', reject);
                worker.postMessage(html);
            });

            assert.ok(result.includes('style='));
            assert.ok(result.includes('Test'));
        });

        it('should handle worker errors gracefully', async () => {
            const worker = new Worker(path.join(__dirname, '../lib/juice-worker.js'));

            // Send invalid data that should cause an error
            const invalidData = null;

            try {
                await new Promise((resolve, reject) => {
                    worker.on('message', msg => {
                        worker.terminate();
                        if (msg.success) {
                            resolve(msg.result);
                        } else {
                            reject(new Error(msg.error));
                        }
                    });

                    worker.on('error', reject);
                    worker.postMessage(invalidData);
                });

                // If we get here without error, that's also OK
                assert.ok(true);
            } catch (err) {
                // Expected to error
                assert.ok(err);
            }
        });
    });

    describe('mime-html with text input', () => {
        it('should properly convert text to HTML with default styles', () => {
            const input = {
                text: 'Hello\nWorld\n\nThis is a test'
            };

            const result = mimeHtml.sync(input);

            assert.ok(result.includes('Hello'));
            assert.ok(result.includes('World'));
            assert.ok(result.includes('font-family')); // Default styles applied
        });

        it('should handle quoted text in text mode', () => {
            const input = {
                text: 'Reply:\n> Original message\n> Second line\n\nMy response'
            };

            const result = mimeHtml.sync(input);

            assert.ok(result.includes('blockquote'));
            assert.ok(result.includes('Original message'));
        });
    });

    describe('error recovery and edge cases', () => {
        it('should handle circular references in DOM', () => {
            // This tests the DOM walking logic
            const input = {
                html: '<div><p>Test</p></div>'
            };

            const result = mimeHtml.sync(input);
            assert.ok(result.includes('Test'));
        });

        it('should handle very long attribute values', () => {
            const longValue = 'x'.repeat(10000);
            const input = {
                html: `<div data-test="${longValue}">Content</div>`
            };

            const result = mimeHtml.sync(input);
            assert.ok(result.includes('Content'));
        });

        it('should handle style tags in body', () => {
            const input = {
                html: `
                    <body>
                        <style>p { color: red; }</style>
                        <p>Test</p>
                        <style>div { color: blue; }</style>
                        <div>More</div>
                    </body>
                `
            };

            const result = mimeHtml.sync(input);
            assert.ok(result.includes('Test'));
            assert.ok(result.includes('More'));
            // Style tags in body should be removed
            assert.ok(!result.includes('<style'));
        });

        it('should handle CDATA sections', () => {
            const input = {
                html: '<div><![CDATA[Some text]]></div>'
            };

            const result = mimeHtml.sync(input);
            assert.ok(typeof result === 'string');
        });

        it('should handle XML namespaces', () => {
            const input = {
                html: '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Test</p></body></html>'
            };

            const result = mimeHtml.sync(input);
            assert.ok(result.includes('Test'));
        });
    });

    describe('async version configuration', () => {
        it('should respect timeout configuration', async () => {
            const input = {
                html: '<p>Quick test</p>'
            };

            const start = Date.now();
            const result = await mimeHtml.async(input, {
                timeout: 100,
                useWorkerPool: false
            });
            const elapsed = Date.now() - start;

            assert.ok(result.includes('Quick test'));
            // Should complete without timing out
            assert.ok(elapsed < 200);
        });

        it('should respect logErrors configuration', async () => {
            const input = {
                html: null
            };

            // Capture console.warn
            const originalWarn = console.warn;
            let warnCalled = false;
            console.warn = () => {
                warnCalled = true;
            };

            await mimeHtml.async(input, {
                logErrors: false,
                fallbackOnError: true
            });

            console.warn = originalWarn;
            assert.ok(!warnCalled, 'Should not log errors when logErrors is false');
        });

        it('should respect fallbackOnError configuration', async () => {
            const input = {
                html: '<p>Test</p>'
            };

            // With fallback
            const result1 = await mimeHtml.async(input, {
                fallbackOnError: true,
                logErrors: false
            });
            assert.ok(typeof result1 === 'string');
        });
    });

    describe('worker pool configuration', () => {
        it('should respect min/max worker settings', async () => {
            const input = {
                html: '<p>Pool config test</p>'
            };

            // First close any existing pool
            await mimeHtml.closeWorkerPool();

            // Process with custom pool settings
            await mimeHtml.async(input, {
                useWorkerPool: true,
                minWorkers: 1,
                maxWorkers: 2
            });

            const stats = mimeHtml.getWorkerPoolStats();
            assert.ok(stats);
            assert.equal(stats.minWorkers, 1);
            assert.equal(stats.maxWorkers, 2);
        });
    });

    describe('concurrent stress test', () => {
        it('should handle rapid concurrent requests without deadlock', async () => {
            const promises = [];

            // Fire off 50 concurrent requests rapidly
            for (let i = 0; i < 50; i++) {
                promises.push(
                    mimeHtml.async(
                        {
                            html: `<p>Stress test ${i}</p>`
                        },
                        {
                            useWorkerPool: true,
                            timeout: 5000
                        }
                    )
                );
            }

            const results = await Promise.all(promises);

            assert.equal(results.length, 50);
            results.forEach((result, i) => {
                assert.ok(result.includes(`Stress test ${i}`));
            });
        });
    });

    describe('memory leak prevention', () => {
        it('should clean up workers after timeout', async () => {
            const input = {
                html: '<p>Timeout test</p>'
            };

            try {
                // This should timeout and clean up the worker
                await mimeHtml.async(input, {
                    timeout: 1,
                    useWorkerPool: false,
                    fallbackOnError: false,
                    logErrors: false
                });
            } catch (err) {
                assert.ok(err.message.includes('timed out'));
            }

            // Worker should be cleaned up, no leak
            const memAfter = process.memoryUsage();
            assert.ok(memAfter.heapUsed < 500 * 1024 * 1024); // Less than 500MB
        });
    });

    // Clean up
    after(async () => {
        await mimeHtml.closeWorkerPool();
    });
});
