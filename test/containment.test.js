'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { mimeHtml } = require('..');

// The message is shown inside a page that is not the sender's. These tests pin what keeps it there:
// a clipping wrapper the sender cannot style, links that cannot reach back, no foreign content.

describe('container', () => {
    it('wraps a message with no body styles in a bare inner element', () => {
        assert.equal(mimeHtml({ html: '<p>x</p>' }), '<div style="overflow: auto;"><div><p>x</p></div></div>');
    });

    it('keeps the body styles off the clipping wrapper', () => {
        const html =
            '<html><body style="display: contents; margin: -500px; overflow: visible; overflow-x: visible; box-shadow: 0 0 0 9999px red; outline: 9999px solid red; color: red">' +
            '<div style="transform: translateY(-300px)">x</div></body></html>';
        const out = mimeHtml({ html });
        assert.ok(out.startsWith('<div style="overflow: auto;"><div style="'), out);
        assert.ok(out.endsWith('</div></div>'), out);
        const inner = /^<div style="overflow: auto;"><div style="([^"]*)">/.exec(out)[1];
        assert.match(inner, /display: contents/);
        assert.match(inner, /margin: -500px/);
        assert.match(inner, /color: red/);
        assert.match(out, /transform: translateY\(-300px\)/);
    });

    it('puts a body rule from the stylesheet on the inner element too', () => {
        const html = '<html><head><style>body { display: contents; margin: -200px; } p { color: red; }</style></head><body><p>x</p></body></html>';
        const out = mimeHtml({ html });
        assert.ok(out.startsWith('<div style="overflow: auto;"><div style="'), out);
        assert.match(out, /display: contents/);
        assert.match(out, /color: red/);
    });

    it('drops the dimensions of the body and keeps its other styles', () => {
        const out = mimeHtml({
            html: '<html><body style="width: 600px; min-height: 100vh; max-width: 50%; background-color: #fff; color: red">x</body></html>'
        });
        assert.doesNotMatch(out, /width|height/);
        assert.match(out, /background-color: (?:#fff|rgb\(255, 255, 255\))/);
        assert.match(out, /color: red/);
    });

    it('drops a body width the CSSOM could not parse', () => {
        // cssstyle parses nothing from this attribute, a browser reads the width
        const out = mimeHtml({ html: '<html><body style="background:url(https://example.com/x.gif) no-repeat; width: 5000px">x</body></html>' });
        assert.doesNotMatch(out, /width/);
        assert.equal(out, '<div style="overflow: auto;"><div>x</div></div>');
    });

    it('keeps body styles the CSSOM could not parse when none of them is forbidden', () => {
        // the old wrapper lost every body style here, because setting its overflow rewrote the
        // attribute from a CSSOM that held nothing
        const out = mimeHtml({ html: '<html><body style="background:url(https://example.com/x.gif) no-repeat; color:red; font:12px serif">x</body></html>' });
        assert.ok(out.includes('<div style="background:url(https://example.com/x.gif) no-repeat; color:red; font:12px serif">x</div>'), out);
    });

    it('still removes position everywhere, including the body', () => {
        const out = mimeHtml({ html: '<html><body style="position: fixed; inset: 0; color: red"><div style="position: sticky; top: 0">x</div></body></html>' });
        assert.doesNotMatch(out, /position/);
        assert.match(out, /color: red/);
        assert.match(out, /top: 0/);
    });

    it('marks skipped inlining on the outer wrapper', () => {
        let css = '';
        for (let i = 0; i <= 5000; i++) {
            css += `.c${i} { color: red; }\n`;
        }
        const out = mimeHtml({ html: `<html><head><style>${css}</style></head><body style="color: blue"><p class="c1">x</p></body></html>` });
        assert.ok(out.startsWith('<div style="overflow: auto;" data-css-inlining="skipped"><div style="color: blue">'), out.slice(0, 120));
    });
});

describe('links', () => {
    it('opens every link in a new context that gets no opener and no referrer', () => {
        const out = mimeHtml({ html: '<a href="https://example.com/" rel="opener">x</a><a href="https://example.com/" target="_top" rel="nofollow">y</a>' });
        assert.equal((out.match(/<a /g) || []).length, 2);
        assert.doesNotMatch(out, /rel="opener"|rel="nofollow"|_top/);
        assert.equal((out.match(/target="_blank"/g) || []).length, 2);
        assert.equal((out.match(/rel="noopener noreferrer"/g) || []).length, 2);
    });

    it('treats an image map area as a link', () => {
        const out = mimeHtml({
            html: '<img src="https://example.com/i.png" usemap="#m"><map name="m"><area shape="rect" coords="0,0,9,9" href="https://example.com/"></map>'
        });
        assert.match(out, /<area [^>]*target="_blank"/);
        assert.match(out, /<area [^>]*rel="noopener noreferrer"/);
    });
});

describe('foreign content', () => {
    it('removes SVG and MathML', () => {
        const out = mimeHtml({
            html:
                '<p>a</p><svg width="20" height="20"><circle cx="10" cy="10" r="8"/></svg><math><mi>x</mi></math>' +
                '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>"><p>b</p>'
        });
        assert.doesNotMatch(out, /<svg|<math|<circle|<mi|onerror/);
        assert.ok(out.includes('<p>a</p>'), out);
    });
});

describe('single sanitization pass for markup without a stylesheet', () => {
    it('sanitizes the same way', () => {
        const out = mimeHtml({
            html: '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><iframe src="https://example.com/"></iframe>'
        });
        assert.equal(out, '<div style="overflow: auto;"><div><p>a</p><a target="_blank" rel="noopener noreferrer">b</a></div></div>');
    });

    for (const [label, tag, close] of [
        ['upper case', '<STYLE>', '</STYLE>'],
        ['whitespace after the name', '<style\n>', '</style>'],
        ['a self-closing slash', '<style/>', '</style>']
    ]) {
        it(`still inlines a stylesheet whose tag uses ${label}`, () => {
            const out = mimeHtml({ html: `<html><head>${tag}p { color: red; }${close}</head><body><p>x</p></body></html>` });
            assert.match(out, /color: red/, out);
        });
    }

    it('leaves a style tag that is only text alone', () => {
        const out = mimeHtml({ html: '<p>write &lt;style&gt; to add rules</p>' });
        assert.equal(out, '<div style="overflow: auto;"><div><p>write &lt;style&gt; to add rules</p></div></div>');
    });
});
