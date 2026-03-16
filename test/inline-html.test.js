'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const inlineHtml = require('../lib/inline-html');

describe('inline-html', () => {
    const baseDate = new Date('2024-06-15T14:30:00Z');

    const fullMessageData = {
        from: [{ name: 'Alice Sender', address: 'alice@example.com' }],
        subject: 'Test Subject',
        date: baseDate,
        to: [{ name: 'Bob Receiver', address: 'bob@example.com' }],
        cc: [{ name: 'Charlie', address: 'charlie@example.com' }],
        bcc: [{ address: 'secret@example.com' }],
        html: '<html><body><p>Original message</p></body></html>'
    };

    describe('reply action', () => {
        it('should create reply with date and from header', () => {
            const result = inlineHtml('reply', '<p>My reply</p>', fullMessageData);
            assert.ok(result.includes('wrote:'));
            assert.ok(result.includes('alice@example.com'));
            assert.ok(result.includes('My reply'));
            assert.ok(result.includes('<blockquote'));
            assert.ok(result.includes('Original message'));
        });

        it('should create reply with no from address using <> fallback', () => {
            const data = { date: baseDate, html: '<p>Body</p>' };
            const result = inlineHtml('reply', '', data);
            assert.ok(result.includes('&lt;&gt;'));
            assert.ok(result.includes('wrote:'));
        });

        it('should create reply with no date', () => {
            const data = {
                from: [{ name: 'Sender', address: 's@test.com' }],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('reply', '', data);
            assert.ok(result.includes('wrote:'));
            assert.ok(!result.includes('undefined'));
        });
    });

    describe('forward action', () => {
        it('should create forward with all headers', () => {
            const result = inlineHtml('forward', '<p>FYI</p>', fullMessageData);
            assert.ok(result.includes('Begin forwarded message:'));
            assert.ok(result.includes('<b>From: </b>'));
            assert.ok(result.includes('<b>Subject: </b>'));
            assert.ok(result.includes('<b>Date: </b>'));
            assert.ok(result.includes('<b>To: </b>'));
            assert.ok(result.includes('<b>Cc: </b>'));
            assert.ok(result.includes('<b>Bcc: </b>'));
            assert.ok(result.includes('FYI'));
            assert.ok(result.includes('Original message'));
        });

        it('should include from fallback in forward with no from', () => {
            const data = { subject: 'Fwd', html: '<p>Body</p>' };
            const result = inlineHtml('forward', '', data);
            assert.ok(result.includes('Begin forwarded message:'));
            assert.ok(!result.includes('<b>From: </b>'));
        });
    });

    describe('unknown action', () => {
        it('should include original body in blockquote without header lines', () => {
            const data = { html: '<p>Body</p>' };
            const result = inlineHtml('draft', '', data);
            assert.ok(result.includes('<blockquote'));
            assert.ok(result.includes('Body'));
            assert.ok(!result.includes('wrote:'));
            assert.ok(!result.includes('Begin forwarded message:'));
        });
    });

    describe('original body extraction', () => {
        it('should use textToHtml when messageData has text but no html', () => {
            const data = { text: 'Plain text original' };
            const result = inlineHtml('reply', '', data);
            assert.ok(result.includes('Plain text original'));
            assert.ok(result.includes('<blockquote'));
        });

        it('should extract body innerHTML when messageData has html', () => {
            const data = { html: '<html><body><p>Extracted</p></body></html>' };
            const result = inlineHtml('reply', '', data);
            assert.ok(result.includes('<p>Extracted</p>'));
            assert.ok(!result.includes('<body>'));
        });

        it('should extract content when html has no body tag', () => {
            const data = { html: '<p>No body tag</p>' };
            const result = inlineHtml('reply', '', data);
            assert.ok(result.includes('No body tag'));
        });

        it('should return messageContent unchanged when no originalBody', () => {
            const data = { text: '', html: '' };
            const result = inlineHtml('reply', 'Untouched', data);
            assert.equal(result, 'Untouched');
        });

        it('should return messageContent when messageData has no text or html', () => {
            const result = inlineHtml('reply', 'Keep this', {});
            assert.equal(result, 'Keep this');
        });
    });

    describe('address formatting', () => {
        it('should format address with both name and address', () => {
            const data = {
                from: [{ name: 'Full Name', address: 'full@test.com' }],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('forward', '', data);
            assert.ok(result.includes('Full Name'));
            assert.ok(result.includes('mailto:full@test.com'));
        });

        it('should format address with name only', () => {
            const data = {
                from: [{ name: 'Name Only' }],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('forward', '', data);
            assert.ok(result.includes('Name Only'));
            assert.ok(!result.includes('mailto:'));
        });

        it('should format address with address only', () => {
            const data = {
                from: [{ address: 'addr@test.com' }],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('forward', '', data);
            assert.ok(result.includes('mailto:addr@test.com'));
        });

        it('should use <> fallback for empty address object', () => {
            const data = {
                from: [{}],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('reply', '', data);
            assert.ok(result.includes('&lt;&gt;'));
        });

        it('should format multiple addresses separated by commas', () => {
            const data = {
                to: [
                    { name: 'A', address: 'a@t.com' },
                    { name: 'B', address: 'b@t.com' }
                ],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('forward', '', data);
            assert.ok(result.includes('a@t.com'));
            assert.ok(result.includes('b@t.com'));
        });

        it('should skip invalid entries in address list', () => {
            const data = {
                to: [null, {}, { name: 'Valid', address: 'v@t.com' }],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('forward', '', data);
            assert.ok(result.includes('v@t.com'));
        });

        it('should omit header for empty address list result', () => {
            const data = {
                to: [{}],
                html: '<p>Body</p>'
            };
            const result = inlineHtml('forward', '', data);
            assert.ok(!result.includes('<b>To: </b>'));
        });
    });

    describe('date formatting', () => {
        it('should format date with locale option', () => {
            const data = { date: baseDate, html: '<p>Body</p>' };
            const result = inlineHtml('forward', '', data, { locale: 'de' });
            assert.ok(result.includes('<b>Date: </b>'));
        });

        it('should format date with timezone option', () => {
            const data = { date: baseDate, html: '<p>Body</p>' };
            const result = inlineHtml('forward', '', data, { tz: 'America/New_York' });
            assert.ok(result.includes('<b>Date: </b>'));
        });

        it('should format date with both locale and timezone', () => {
            const data = { date: baseDate, html: '<p>Body</p>' };
            const result = inlineHtml('forward', '', data, { locale: 'en', tz: 'UTC' });
            assert.ok(result.includes('<b>Date: </b>'));
        });
    });

    describe('messageContent handling', () => {
        it('should handle null messageContent', () => {
            const data = { html: '<p>Body</p>' };
            const result = inlineHtml('reply', null, data);
            assert.ok(result.includes('<html>'));
            assert.ok(result.includes('Body'));
        });

        it('should extract body from full HTML messageContent', () => {
            const data = { html: '<p>Original</p>' };
            const result = inlineHtml('reply', '<html><body><p>Reply content</p></body></html>', data);
            assert.ok(result.includes('Reply content'));
        });
    });

    describe('output structure', () => {
        it('should produce valid HTML document structure', () => {
            const result = inlineHtml('reply', 'Reply', fullMessageData);
            assert.ok(result.includes('<html>'));
            assert.ok(result.includes('<head>'));
            assert.ok(result.includes('charset=utf-8'));
            assert.ok(result.includes('<body'));
            assert.ok(result.includes('</html>'));
        });
    });
});
