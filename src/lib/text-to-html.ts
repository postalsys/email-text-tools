import LinkifyIt from 'linkify-it';
import he from 'he';
import { TLDS } from './commonjs.cjs';

const linkify = new LinkifyIt()
    .tlds(TLDS) // Reload with full tlds list
    .tlds('onion', true) // Add unofficial `.onion` domain
    .add('git:', 'http:') // Add `git:` protocol as "alias"
    .set({ fuzzyIP: true });

// Quote levels deeper than this are kept as literal "> " text. Every level costs a few stack
// frames here and a nested <blockquote> later, so hostile input with thousands of leading ">"
// used to overflow the stack.
const MAX_QUOTE_DEPTH = 100;

type LinkMatch = NonNullable<ReturnType<LinkifyIt['match']>>[number];

interface QuoteNode {
    type: 'text' | 'quote';
    parent?: QuoteNode;
    lines?: string[];
    children: QuoteNode[];
}

// A node created by createNode(), which always has a parent and a line list
interface ChildNode extends QuoteNode {
    parent: QuoteNode;
    lines: string[];
}

function generateQuotedTree(text: string): QuoteNode {
    let lines = text.split(/\r?\n/);

    let tree: QuoteNode = {
        type: 'text',
        children: []
    };

    let createNode = (parent: QuoteNode, type: QuoteNode['type']): ChildNode => {
        let node: ChildNode = {
            parent,
            type,
            lines: [],
            children: []
        };
        parent.children.push(node);
        return node;
    };

    let walkNode = (curNode: ChildNode, lines: string[], depth: number): void => {
        for (let line of lines) {
            if (depth < MAX_QUOTE_DEPTH && /^>/.test(line)) {
                if (curNode.type !== 'quote') {
                    curNode = createNode(curNode.parent, 'quote');
                }
                curNode.lines.push(line.replace(/^> ?/, ''));
            } else if (curNode.type === 'quote') {
                // process child

                let quoteNode = curNode;

                let childNode = createNode(curNode, 'text');
                walkNode(childNode, quoteNode.lines, depth + 1);

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
            walkNode(childNode, quoteNode.lines, depth + 1);
        }
    };

    let rootNode = createNode(tree, 'text');
    walkNode(rootNode, lines, 0);

    return tree;
}

/**
 * Return HTML escaped text with clickable links
 * @param text Text content to HTML escape
 * @returns HTML escaped content
 */
function linkifyAndHtmlEscape(text: string): string {
    try {
        let links = linkify.match(text);
        if (links && links.length) {
            let parts: Array<{ type: 'text'; content: string } | ({ type: 'link' } & LinkMatch)> = [];
            let cursor = 0;
            for (let link of links) {
                if (cursor < link.index) {
                    parts.push({
                        type: 'text',
                        content: text.substring(cursor, link.index)
                    });
                    cursor = link.index;
                }
                parts.push(Object.assign({ type: 'link' as const }, link));
                cursor = link.lastIndex;
            }

            if (cursor < text.length) {
                parts.push({
                    type: 'text',
                    content: text.slice(cursor)
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
    } catch (_err) {
        // ignore?
    }

    // No links or exception, so HTML escape everything
    return he.encode(text, { useNamedReferences: true });
}

function textLinesToHtml(lines: string[]): string {
    let textparts = ['<p>'];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        if (!line.trim()) {
            if (i && lines[i - 1].trim()) {
                textparts.push('</p><p>');
            }
        } else if (i < lines.length - 1 && lines[i + 1].trim()) {
            let escaped = linkifyAndHtmlEscape(line);
            if (/^[ \t]*[-_]{2,}[ \t]*$/.test(escaped)) {
                textparts.push(`<hr />`);
            } else {
                textparts.push(`${escaped}<br />`);
            }
        } else {
            let escaped = linkifyAndHtmlEscape(line);
            if (/^[ \t]*[-_]{2,}[ \t]*$/.test(escaped)) {
                escaped = `<hr />`;
            }
            textparts.push(escaped);
        }
    }

    return textparts.join('\n') + '</p>';
}

export default function textToHtml(text?: string | Buffer | null): string | undefined {
    text = (text || '').toString();
    let tree = generateQuotedTree(text);

    let blockQuoteCounter = 0;
    function processQuotedNode(curNode: QuoteNode, level?: number): string | undefined {
        let entries: string[] = [];
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
        return undefined;
    }

    let generatedHtml = processQuotedNode(tree);

    return generatedHtml;
}
