'use strict';

const textToHtml = require('./lib/text-to-html');
const htmlToText = require('./lib/html-to-text');
const inlineHtml = require('./lib/inline-html');
const inlineText = require('./lib/inline-text');
const mimeHtml = require('./lib/mime-html');
const extractReply = require('./lib/extract-reply');

module.exports = { textToHtml, htmlToText, inlineHtml, inlineText, mimeHtml, extractReply };
