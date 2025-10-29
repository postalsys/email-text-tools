'use strict';
const { compile } = require('html-to-text');

// Post-process function to clean up excessive newlines
function cleanupNewlines(text) {
    // Replace 3 or more consecutive newlines with just 2
    // This handles cases where HTML has many nested empty divs
    return text.replace(/\n{3,}/g, '\n\n');
}

const htmlToTextCompiled = compile({
    wordwrap: 160,
    selectors: [
        // Block elements that should preserve line breaks
        { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        // Divs get minimal breaks - many HTML emails wrap each line in a div
        { selector: 'div', options: { leadingLineBreaks: 1, trailingLineBreaks: 0 } },
        { selector: 'pre', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'blockquote', options: { leadingLineBreaks: 1, trailingLineBreaks: 1, trimEmptyLines: true } },

        // Headers should have spacing
        { selector: 'h1', options: { leadingLineBreaks: 2, trailingLineBreaks: 1, uppercase: false } },
        { selector: 'h2', options: { leadingLineBreaks: 2, trailingLineBreaks: 1, uppercase: false } },
        { selector: 'h3', options: { leadingLineBreaks: 2, trailingLineBreaks: 1, uppercase: false } },
        { selector: 'h4', options: { leadingLineBreaks: 2, trailingLineBreaks: 1, uppercase: false } },
        { selector: 'h5', options: { leadingLineBreaks: 2, trailingLineBreaks: 1, uppercase: false } },
        { selector: 'h6', options: { leadingLineBreaks: 2, trailingLineBreaks: 1, uppercase: false } },

        // Line breaks
        { selector: 'br', options: { leadingLineBreaks: 1, trailingLineBreaks: 0 } },
        { selector: 'hr', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },

        // Lists should preserve structure
        { selector: 'ul', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'ol', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },

        // Tables
        { selector: 'table', format: 'dataTable' },

        // Ignore images
        { selector: 'img', format: 'skip' }
    ],
    hideLinkHrefIfSameAsText: true,
    // Preserve whitespace better for content
    preserveNewlines: true
});

// Wrapper function that applies post-processing
function htmlToText(html) {
    const text = htmlToTextCompiled(html);
    return cleanupNewlines(text);
}

module.exports = htmlToText;
