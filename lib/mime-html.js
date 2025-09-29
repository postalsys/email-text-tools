'use strict';

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const juice = require('juice');
const he = require('he');
const { Worker } = require('worker_threads');
const path = require('path');

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
// Wrapper for juice that runs in a worker thread with timeout protection
async function juiceWithTimeout(html, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'juice-worker.js'));
        let timedOut = false;
        
        const timeout = setTimeout(() => {
            timedOut = true;
            worker.terminate();
            reject(new Error('Juice processing timed out - likely due to unsupported CSS selectors'));
        }, timeoutMs);
        
        worker.on('message', (msg) => {
            clearTimeout(timeout);
            worker.terminate();
            if (msg.success) {
                resolve(msg.result);
            } else {
                reject(new Error(msg.error));
            }
        });
        
        worker.on('error', (err) => {
            clearTimeout(timeout);
            if (!timedOut) {
                reject(err);
            }
        });
        
        worker.postMessage(html);
    });
}

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

function mimeHtmlSync(message) {
    let html = message.html;
    if (!html && message.text) {
        html = textToHtml(message.text) || '';
        if (html) {
            html = INLINE_STYLE_BLOCK + html;
        }
    }

    html = html.toString().replace(/^"data:[^"]+"/g, '');

    const window = new JSDOM('').window;

    const DOMPurify = createDOMPurify(window);

    // first pass, outputs a fixed HTML page
    html = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORCE_BODY: false, FORBID_TAGS });

    try {
        // Pre-process HTML to remove known problematic CSS that causes juice to hang
        // This is a fallback for the sync version - the async version with timeout is preferred
        const tempDoc = new JSDOM(html).window.document;
        
        // Remove any style tags from within body content
        const bodyStyleTags = tempDoc.body ? tempDoc.body.querySelectorAll('style') : [];
        bodyStyleTags.forEach(tag => tag.remove());
        
        // Process remaining style tags to remove known problematic selectors
        const styleTags = tempDoc.querySelectorAll('style');
        styleTags.forEach(styleTag => {
            let cssContent = styleTag.textContent;
            
            // Remove rules with known problematic pseudo-classes
            const problematicSelectors = [':is\\(', ':where\\(', ':has\\(', ':not\\(.*:.*\\)'];
            problematicSelectors.forEach(selector => {
                const regex = new RegExp(`[^{}]*${selector}[^{}]*\\{[^}]*\\}`, 'gi');
                cssContent = cssContent.replace(regex, '');
            });
            
            styleTag.textContent = cssContent;
        });
        
        html = tempDoc.documentElement.outerHTML;
        
        // Run juice synchronously - risky but backwards compatible
        html = juice(html);
    } catch (err) {
        // not so important, so we'll ignore if style inlining fails
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

    // remove specific style properties for all DOM nodes
    let walkDom = node => {
        if (node.style) {
            for (let disallowedStyle of FORBID_STYLES) {
                node.style.removeProperty(disallowedStyle);
            }
        }

        if (node.childNodes) {
            // Convert NodeList to array to avoid infinite loops if DOM changes during iteration
            const children = Array.from(node.childNodes);
            for (let childNode of children) {
                walkDom(childNode);
            }
        }
    };
    walkDom(dom);

    let bodyStyles = (dom.getAttribute('style') || '').toString().trim();

    // embed into a styled container
    return `<div style="${he.encode(bodyStyles)}">${dom.innerHTML.trim()}</div>`;
}

async function mimeHtmlAsync(message) {
    let html = message.html;
    if (!html && message.text) {
        html = textToHtml(message.text) || '';
        if (html) {
            html = INLINE_STYLE_BLOCK + html;
        }
    }

    html = html.toString().replace(/^"data:[^"]+"/g, '');

    const window = new JSDOM('').window;
    const DOMPurify = createDOMPurify(window);

    // first pass, outputs a fixed HTML page
    html = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORCE_BODY: false, FORBID_TAGS });

    try {
        // Pre-process HTML to remove style tags from body
        const tempDoc = new JSDOM(html).window.document;
        const bodyStyleTags = tempDoc.body ? tempDoc.body.querySelectorAll('style') : [];
        bodyStyleTags.forEach(tag => tag.remove());
        html = tempDoc.documentElement.outerHTML;
        
        // Use worker thread with timeout for juice - protects against ANY problematic CSS
        html = await juiceWithTimeout(html);
    } catch (err) {
        // If juice fails or times out, continue without inlining styles
        // The HTML is still usable, just without inlined CSS
        console.warn('Juice processing failed or timed out:', err.message);
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

    // remove specific style properties for all DOM nodes
    let walkDom = node => {
        if (node.style) {
            for (let disallowedStyle of FORBID_STYLES) {
                node.style.removeProperty(disallowedStyle);
            }
        }

        if (node.childNodes) {
            // Convert NodeList to array to avoid infinite loops if DOM changes during iteration
            const children = Array.from(node.childNodes);
            for (let childNode of children) {
                walkDom(childNode);
            }
        }
    };
    walkDom(dom);

    let bodyStyles = (dom.getAttribute('style') || '').toString().trim();

    // embed into a styled container
    return `<div style="${he.encode(bodyStyles)}">${dom.innerHTML.trim()}</div>`;
}

// Main export - maintains backward compatibility with sync API
// but uses the safer sync version with known problematic selectors removed
function mimeHtml(message) {
    // Use the sync version for backward compatibility
    return mimeHtmlSync(message);
}

// Export both versions
mimeHtml.async = mimeHtmlAsync;
mimeHtml.sync = mimeHtmlSync;

module.exports = mimeHtml;
