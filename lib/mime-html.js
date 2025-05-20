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

const FORBID_STYLES = [
    'all',
    'position',
    'clip',
    'animation',
    'float',
    'clear',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-timing-function',
    'offset',
    'offset-anchor',
    'offset-distance',
    'offset-path',
    'offset-position',
    'offset-rotate',
    'paint-order',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'zoom'
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

    html = html.toString().replace(/^"data:[^"]+"/g, '');
    console.log('HTML', html);
    try {
        //inline styles
        //html = juice(html);
    } catch (err) {
        // should log?
    }

    console.log(1, Date.now());
    const window = new JSDOM('').window;
    console.log(2, Date.now());
    const DOMPurify = createDOMPurify(window);
    console.log(3, Date.now());
    // first pass, outputs a fixed HTML page
    html = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORCE_BODY: false, FORBID_TAGS });
    console.log(4, Date.now());
    try {
        //inline styles
        html = juice(html);
    } catch (err) {
        console.log(err);
        // not so important, so we'll ignore if style inlining fails
        // should log?
    }
    console.log(5, Date.now());

    // second pass, outputs a BODY DOM element
    const dom = DOMPurify.sanitize(html, {
        RETURN_DOM: true,
        WHOLE_DOCUMENT: false,
        FORCE_BODY: true,
        FORBID_TAGS: FORBID_TAGS_ALL
    });
    console.log(6, Date.now());

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

    console.log(7, Date.now());
    // remove specific style properties for all DOM nodes
    let walkDom = node => {
        if (node.style) {
            for (let disallowedStyle of FORBID_STYLES) {
                node.style.removeProperty(disallowedStyle);
            }
        }

        if (node.childNodes) {
            for (let childNode of node.childNodes) {
                walkDom(childNode);
            }
        }
    };
    walkDom(dom);

    console.log(8, Date.now());
    let bodyStyles = (dom.getAttribute('style') || '').toString().trim();

    // embed into a styled container
    return `<div style="${he.encode(bodyStyles)}">${dom.innerHTML.trim()}</div>`;
}

module.exports = mimeHtml;
