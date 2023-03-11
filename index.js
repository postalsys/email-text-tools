'use strict';

const textToHtml = require('./lib/text-to-html');
const htmlToText = require('./lib/html-to-text');
const inlineHtml = require('./lib/inline-html');
const inlineText = require('./lib/inline-text');
const mimeHtml = require('./lib/mime-html');
const generateSummary = require('./lib/generate-summary');

module.exports = { textToHtml, htmlToText, inlineHtml, inlineText, mimeHtml, generateSummary };
