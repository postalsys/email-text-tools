'use strict';
const { compile } = require('html-to-text');

const htmlToText = compile({
    wordwrap: 160,
    selectors: [
        { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'pre', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'table.class#id', format: 'dataTable' },
        // ignore images
        { selector: 'img', format: 'skip' }
    ],
    hideLinkHrefIfSameAsText: true
});

module.exports = htmlToText;
