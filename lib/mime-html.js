'use strict';

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const juice = require('juice');
const he = require('he');

const textToHtml = require('./text-to-html');

const FORBID_TAGS = [
    'title',
    'link',
    'meta',
    'base',
    'basefont',
    'frame',
    'iframe',
    'frameset',
    'template',
    'script',
    'noframes',
    'noscript',
    'object',
    'embed',
    'dialog',
    'canvas',
    'audio',
    'video',
    'applet'
];
// keep the style at first
const FORBID_TAGS_ALL = ['style'].concat(FORBID_TAGS);

// define styles for plaintext emails
const INLINE_STYLE_BLOCK = `<style>

body, td, th, p {
    font-family: sans-serif;
    font-size: 12px;
}

blockquote {
    border-left-width: 2px;
    border-left-style: solid;
    
    border-left-color: darkblue;
    color: darkblue;

    margin: 1rem 0;
    padding-left: 1rem;
}

blockquote blockquote{
    border-left-color: royalblue;
    color: royalblue;
}

blockquote blockquote blockquote{
    border-left-color: dodgerblue;
    color: dodgerblue;
}

blockquote blockquote blockquote blockquote{
    border-left-color: darkblue;
    color: darkblue;
}

</style>`;

function mimeHtml(message) {
    let html = message.html;
    if (!html && message.text) {
        html = textToHtml(message.text) || '';
        if (html) {
            html = INLINE_STYLE_BLOCK + html;
        }
    }

    try {
        //inline styles
        //html = juice(html);
    } catch (err) {
        // should log?
    }

    const window = new JSDOM('').window;
    const DOMPurify = createDOMPurify(window);

    // first pass, outputs a fixed HTML page
    html = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORCE_BODY: false, FORBID_TAGS });

    try {
        //inline styles
        html = juice(html);
    } catch (err) {
        // not so important, so we'll ignore if style inlining fails
        // should log?
    }

    // second pass, outputs a BODY DOM element
    const dom = DOMPurify.sanitize(html, {
        RETURN_DOM: true,
        WHOLE_DOCUMENT: false,
        FORCE_BODY: true,
        FORBID_TAGS: FORBID_TAGS_ALL
    });

    // mark all links to be opened in a new window
    for (let elm of dom.querySelectorAll('a')) {
        elm.setAttribute('target', '_blank');
    }

    dom.style.overflow = 'auto';

    // return <BODY> HTML

    dom.style.removeProperty('width');
    dom.style.removeProperty('min-width');
    dom.style.removeProperty('max-width');
    dom.style.removeProperty('height');
    dom.style.removeProperty('min-height');
    dom.style.removeProperty('max-height');
    let bodyStyles = (dom.getAttribute('style') || '').toString().trim();

    // embed into a styled container
    return `<div style="${he.encode(bodyStyles)}">${dom.innerHTML.trim()}</div>`;
}

module.exports = mimeHtml;
