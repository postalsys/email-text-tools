'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const inlineText = require('../lib/inline-text');

describe('inline-text', () => {
    const baseDate = new Date('2024-06-15T14:30:00Z');

    const fullMessageData = {
        from: [{ name: 'Alice Sender', address: 'alice@example.com' }],
        subject: 'Test Subject',
        date: baseDate,
        to: [{ name: 'Bob', address: 'bob@example.com' }],
        cc: [{ name: 'Charlie', address: 'charlie@example.com' }],
        bcc: [{ address: 'secret@example.com' }],
        text: 'Original message text'
    };

    describe('reply action', () => {
        it('should create reply with "On date, from wrote:" header', () => {
            const result = inlineText('reply', 'My reply', fullMessageData);
            assert.ok(result.includes('My reply'));
            assert.ok(result.includes('> On '));
            assert.ok(result.includes('wrote:'));
            assert.ok(result.includes('alice@example.com'));
            assert.ok(result.includes('> Original message text'));
        });

        it('should create reply with no from using <> fallback', () => {
            const data = { date: baseDate, text: 'Body text' };
            const result = inlineText('reply', '', data);
            assert.ok(result.includes('<>'));
            assert.ok(result.includes('wrote:'));
        });

        it('should include original body with > quoting', () => {
            const data = { text: 'Line 1\nLine 2\nLine 3' };
            const result = inlineText('reply', 'Reply', data);
            assert.ok(result.includes('> Line 1'));
            assert.ok(result.includes('> Line 2'));
            assert.ok(result.includes('> Line 3'));
        });
    });

    describe('forward action', () => {
        it('should create forward with all headers', () => {
            const result = inlineText('forward', 'FYI', fullMessageData);
            assert.ok(result.includes('> Begin forwarded message:'));
            assert.ok(result.includes('> From:'));
            assert.ok(result.includes('> Subject: Test Subject'));
            assert.ok(result.includes('> Date:'));
            assert.ok(result.includes('> To:'));
            assert.ok(result.includes('> Cc:'));
            assert.ok(result.includes('> Bcc:'));
            assert.ok(result.includes('> Original message text'));
        });

        it('should omit from header when no from provided', () => {
            const data = { subject: 'Fwd', text: 'Body' };
            const result = inlineText('forward', '', data);
            assert.ok(result.includes('> Begin forwarded message:'));
            assert.ok(result.includes('> Subject: Fwd'));
            assert.ok(!result.includes('> From:'));
        });
    });

    describe('unknown action', () => {
        it('should include original body without typed headers', () => {
            const data = { text: 'Body text' };
            const result = inlineText('other', '', data);
            assert.ok(result.includes('> Body text'));
            assert.ok(!result.includes('wrote:'));
            assert.ok(!result.includes('Begin forwarded message:'));
        });
    });

    describe('original body source', () => {
        it('should use htmlToText when messageData has html but no text', () => {
            const data = { html: '<p>HTML content</p>' };
            const result = inlineText('reply', '', data);
            assert.ok(result.includes('HTML content'));
        });

        it('should use text directly when available', () => {
            const data = { text: 'Direct text', html: '<p>HTML</p>' };
            const result = inlineText('reply', '', data);
            assert.ok(result.includes('> Direct text'));
        });

        it('should return messageContent unchanged when no originalBody', () => {
            const result = inlineText('reply', 'Keep this', { text: '' });
            assert.equal(result, 'Keep this');
        });

        it('should return messageContent when messageData is empty', () => {
            const result = inlineText('reply', 'Keep', {});
            assert.equal(result, 'Keep');
        });
    });

    describe('address formatting', () => {
        it('should format address with name and address', () => {
            const data = {
                from: [{ name: 'Full Name', address: 'full@test.com' }],
                text: 'Body'
            };
            const result = inlineText('forward', '', data);
            assert.ok(result.includes('Full Name <full@test.com>'));
        });

        it('should format address with name only', () => {
            const data = {
                from: [{ name: 'Name Only' }],
                text: 'Body'
            };
            const result = inlineText('forward', '', data);
            assert.ok(result.includes('Name Only'));
            assert.ok(!result.includes('<>'));
        });

        it('should format address with address only', () => {
            const data = {
                from: [{ address: 'addr@test.com' }],
                text: 'Body'
            };
            const result = inlineText('forward', '', data);
            assert.ok(result.includes('<addr@test.com>'));
        });

        it('should use <> fallback for empty address object', () => {
            const data = {
                from: [{}],
                text: 'Body'
            };
            const result = inlineText('reply', '', data);
            assert.ok(result.includes('<>'));
        });

        it('should format multiple addresses separated by commas', () => {
            const data = {
                to: [
                    { name: 'A', address: 'a@t.com' },
                    { name: 'B', address: 'b@t.com' }
                ],
                text: 'Body'
            };
            const result = inlineText('forward', '', data);
            assert.ok(result.includes('A <a@t.com>'));
            assert.ok(result.includes('B <b@t.com>'));
        });

        it('should skip invalid entries in address list', () => {
            const data = {
                to: [null, {}, { name: 'Valid', address: 'v@t.com' }],
                text: 'Body'
            };
            const result = inlineText('forward', '', data);
            assert.ok(result.includes('Valid <v@t.com>'));
        });

        it('should omit header for empty address list result', () => {
            const data = {
                to: [{}],
                text: 'Body'
            };
            const result = inlineText('forward', '', data);
            assert.ok(!result.includes('> To:'));
        });
    });

    describe('escapeText', () => {
        it('should handle \\r\\n line endings', () => {
            const data = { text: 'Line1\r\nLine2\r\nLine3' };
            const result = inlineText('reply', '', data);
            assert.ok(result.includes('> Line1'));
            assert.ok(result.includes('> Line2'));
            assert.ok(result.includes('> Line3'));
        });
    });

    describe('date formatting', () => {
        it('should format date with locale', () => {
            const data = { date: baseDate, text: 'Body' };
            const result = inlineText('forward', '', data, { locale: 'de' });
            assert.ok(result.includes('> Date:'));
        });

        it('should format date with timezone', () => {
            const data = { date: baseDate, text: 'Body' };
            const result = inlineText('forward', '', data, { tz: 'America/New_York' });
            assert.ok(result.includes('> Date:'));
        });
    });

    describe('messageContent handling', () => {
        it('should handle null messageContent', () => {
            const data = { text: 'Body' };
            const result = inlineText('reply', null, data);
            assert.ok(typeof result === 'string');
            assert.ok(result.includes('> Body'));
        });
    });
});
