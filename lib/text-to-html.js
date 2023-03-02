'use strict';

const beautifyHtml = require('js-beautify').html;
const linkifyIt = require('linkify-it');
const tlds = require('tlds');
const he = require('he');

const linkify = linkifyIt()
    .tlds(tlds) // Reload with full tlds list
    .tlds('onion', true) // Add unofficial `.onion` domain
    .add('git:', 'http:') // Add `git:` protocol as "alias"
    .set({ fuzzyIP: true });

function generateQuotedTree(text) {
    let lines = text.split(/\r?\n/);

    let tree = {
        type: 'text',
        children: []
    };

    let createNode = (parent, type) => {
        let node = {
            parent,
            type,
            lines: [],
            children: []
        };
        parent.children.push(node);
        return node;
    };

    let walkNode = (curNode, lines) => {
        for (let line of lines) {
            if (/^>/.test(line)) {
                if (curNode.type !== 'quote') {
                    curNode = createNode(curNode.parent, 'quote');
                }
                curNode.lines.push(line.replace(/^> ?/, ''));
            } else if (curNode.type === 'quote') {
                // process child

                let quoteNode = curNode;

                let childNode = createNode(curNode, 'text');
                walkNode(childNode, quoteNode.lines);

                curNode = createNode(curNode.parent, 'text');
                curNode.lines.push(line);
            } else {
                curNode.lines.push(line);
            }
        }

        if (curNode.type === 'quote') {
            // process child

            let quoteNode = curNode;

            let childNode = createNode(curNode, 'text');
            walkNode(childNode, quoteNode.lines);
        }
    };

    let rootNode = createNode(tree, 'text');
    walkNode(rootNode, lines);

    return tree;
}

/**
 * Return HTML escaped text with clickable links
 * @param {String} text Text content to HTML escape
 * @returns {String} HTML escaped content
 */
function linkifyAndHtmlEscape(text) {
    try {
        let links = linkify.match(text);
        if (links && links.length) {
            let parts = [];
            let cursor = 0;
            for (let link of links) {
                if (cursor < link.index) {
                    parts.push({
                        type: 'text',
                        content: text.substring(cursor, link.index)
                    });
                    cursor = link.index;
                }
                parts.push(Object.assign({ type: 'link' }, link));
                cursor = link.lastIndex;
            }

            if (cursor < text.length) {
                parts.push({
                    type: 'text',
                    content: text.substr(cursor)
                });
            }

            return parts
                .map(part => {
                    switch (part.type) {
                        case 'text': {
                            // normal text, escape HTML
                            return he.encode(part.content, { useNamedReferences: true });
                        }
                        case 'link':
                            // URL with html escaped text content and URL
                            return `<a href="${he.encode(part.url, { useNamedReferences: true })}">${he.encode(part.text, {
                                useNamedReferences: true
                            })}</a>`;
                    }
                    return '';
                })
                .join('');
        }
    } catch (err) {
        // ignore?
    }

    // No links or exception, so HTML escape everything
    return he.encode(text, { useNamedReferences: true });
}

function textLinesToHtml(lines) {
    let textparts = ['<p>'];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        if (!line.trim()) {
            if (i && lines[i - 1].trim()) {
                textparts.push('</p><p>');
            }
        } else if (i < lines.length - 1 && lines[i + 1].trim()) {
            let escaped = linkifyAndHtmlEscape(line);
            if (/^[ \t]*[-_]+[ \t]*$/.test(escaped)) {
                textparts.push(`<hr />`);
            } else {
                textparts.push(`${escaped}<br />`);
            }
        } else {
            let escaped = linkifyAndHtmlEscape(line);
            if (/^[ \t]*[-_]+[ \t]*$/.test(escaped)) {
                escaped = `<hr />`;
            }
            textparts.push(escaped);
        }
    }

    return textparts.join('\n') + '</p>';
}

function textToHtml(text) {
    text = (text || '').toString();
    let tree = generateQuotedTree(text);

    let blockQuoteCounter = 0;
    function processQuotedNode(curNode, level) {
        let entries = [];
        level = (level || 0) + 1;

        if (curNode.type === 'text') {
            for (let child of curNode.children) {
                let content = processQuotedNode(child);
                if (typeof content === 'string') {
                    entries.push(content);
                }
            }

            if (curNode.lines && curNode.lines.length) {
                entries.push(textLinesToHtml(curNode.lines));
            }
        }

        if (curNode.type === 'quote') {
            for (let child of curNode.children) {
                let content = processQuotedNode(child, level);
                if (typeof content === 'string') {
                    let id = ++blockQuoteCounter;
                    entries.push(
                        `<blockquote type="cite" class="ee-block-${level}"><!-- blocquote ${id} start-->${content}</blockquote><!-- blocquote ${id} end-->`
                    );
                }
            }
        }

        if (entries.length) {
            return entries.join('\n');
        }
    }

    let generatedHtml = processQuotedNode(tree);

    try {
        return beautifyHtml(generatedHtml);
    } catch (err) {
        // ignore, might fail
    }

    return generatedHtml;
}

module.exports = textToHtml;
