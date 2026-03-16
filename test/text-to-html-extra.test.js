'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const textToHtml = require('../lib/text-to-html');

describe('text-to-html additional coverage', () => {
    describe('trailing quoted lines', () => {
        it('should handle text ending with quoted lines', () => {
            const result = textToHtml('Normal line\n> Quoted at end\n> Still quoted');
            assert.ok(result.includes('<blockquote'));
            assert.ok(result.includes('Quoted at end'));
            assert.ok(result.includes('Still quoted'));
            assert.ok(result.includes('Normal line'));
        });
    });

    describe('horizontal rule detection', () => {
        it('should convert --- to <hr /> when followed by non-empty line', () => {
            const result = textToHtml('Before\n---\nAfter');
            assert.ok(result.includes('<hr />'));
            assert.ok(result.includes('Before'));
            assert.ok(result.includes('After'));
        });

        it('should convert --- to <hr /> when it is the last line', () => {
            const result = textToHtml('Before\n---');
            assert.ok(result.includes('<hr />'));
            assert.ok(result.includes('Before'));
        });

        it('should convert ___ to <hr />', () => {
            const result = textToHtml('Before\n___\nAfter');
            assert.ok(result.includes('<hr />'));
        });

        it('should convert --- to <hr /> when followed by empty line', () => {
            const result = textToHtml('Before\n---\n');
            assert.ok(result.includes('<hr />'));
        });
    });
});
