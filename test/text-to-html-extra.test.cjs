'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const textToHtml = require('@postalsys/email-text-tools/lib/text-to-html');

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

// linkify-it 6 changed several defaults; these pin what textToHtml keeps doing
describe('text-to-html link detection', () => {
    const links = text => (textToHtml(text).match(/<a href="[^"]*"/g) || []).map(tag => tag.slice(9, -1).replace(/&apos;|&#x27;|&#39;/g, "'"));

    const cases = [
        // links without a scheme, which linkify-it 6 does not find by default
        ['see example.com and www.example.org/path', ['http://example.com', 'http://www.example.org/path']],
        ['host 192.0.2.10/status', ['http://192.0.2.10/status']],
        ['onion address abc.onion', ['http://abc.onion']],
        // addresses without mailto:
        ['mail bob@example.org today', ['mailto:bob@example.org']],
        // userinfo stays part of the link
        ['open http://user:pw@example.com/x now', ['http://user:pw@example.com/x']],
        // git: validates like http:
        ['clone git://github.com/a/b.git', ['git://github.com/a/b.git']],
        // an apostrophe inside a local part is fine, a quote around an address is not part of it
        ["mail o'brien@example.com", ["mailto:o'brien@example.com"]],
        ["contact 'andris@example.com'", []],
        // a path in front of an at sign is not the local part of an address
        ['see usr/lib/addons/langpack-de@firefox.example.com/install.rdf', []],
        // closing quotes are not part of a link
        ['read “https://example.com/quoted” now', ['https://example.com/quoted']],
        // bracketed IPv6 hosts
        ['call https://[2001:db8::1]:8080/x', ['https://[2001:db8::1]:8080/x']]
    ];

    for (const [text, expected] of cases) {
        it(`links ${JSON.stringify(text)}`, () => {
            assert.deepStrictEqual(links(text), expected);
        });
    }
});
