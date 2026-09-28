'use strict';

const textToHtml = require('./lib/text-to-html');
const htmlToText = require('./lib/html-to-text');
const inlineHtml = require('./lib/inline-html');
const inlineText = require('./lib/inline-text');

module.exports = {
    textToHtml,
    htmlToText,
    inlineHtml,
    inlineText
};

// mimeHtml loads jsdom, which costs tens of megabytes of heap, so it is only loaded on first
// access and callers that only need the other helpers never pay for it.
Object.defineProperty(module.exports, 'mimeHtml', {
    enumerable: true,
    get() {
        return require('./lib/mime-html');
    }
});
