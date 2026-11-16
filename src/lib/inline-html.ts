import HTMLParser from 'node-html-parser';
import he from 'he';
import type { FormatDateOptions } from './format-date.js';
import { describeHeader, forwardLines, replyLine } from './inline-header.js';
import type { HeaderRenderer } from './inline-header.js';
import textToHtml from './text-to-html.js';
import { MAX_NESTING_DEPTH, exceedsNestingDepth, fallbackText } from './html-guard.js';

/** An address of the quoted message */
export interface MessageAddress {
    name?: string | undefined;
    address?: string | undefined;
}

/** The message being replied to or forwarded */
export interface QuotedMessage {
    from?: MessageAddress | MessageAddress[] | null | undefined;
    to?: MessageAddress | MessageAddress[] | null | undefined;
    cc?: MessageAddress | MessageAddress[] | null | undefined;
    bcc?: MessageAddress | MessageAddress[] | null | undefined;
    subject?: string | null | undefined;
    date?: Date | string | number | null | undefined;
    html?: string | Buffer | null | undefined;
    text?: string | null | undefined;
}

export type InlineAction = 'reply' | 'reply-all' | 'forward';

function escapeHtml(text: string): string {
    return he.encode(text, { useNamedReferences: true });
}

// Escaped text in place of a body that is not worth parsing
function fallbackBody(html: string): string {
    return `<div style="white-space: pre-wrap;">${escapeHtml(fallbackText(html))}</div>`;
}

// An inserted name, address or date inside a right-to-left header: isolated, so its own
// direction is worked out separately and it can not reorder the words around it
function isolate(html: string): string {
    return `<bdi>${html}</bdi>`;
}

function getHtmlBody(input: string | Buffer | null | undefined): string {
    const html = ((input && input.toString()) || '').trim();
    if (!html) {
        return '';
    }

    // node-html-parser spends cubic time removing the elements left open at the end of a document
    // (16 KB of unclosed <b> tags took ten seconds), so the depth check that guards mimeHtml()
    // refuses the obvious shapes before parsing. The parse option leaves whatever is still open in
    // place instead of reparenting it, so a shape the check underestimates (it follows the HTML
    // parsing rules, node-html-parser ignores more end tags) costs linear time and at worst a stack
    // overflow in the serializer, caught below
    if (exceedsNestingDepth(html, MAX_NESTING_DEPTH)) {
        return fallbackBody(html);
    }
    try {
        const root = HTMLParser.parse(html, { parseNoneClosedTags: true });
        const body = root.querySelector('body') || root.querySelector('html') || root;
        return (body.innerHTML || '').trim();
    } catch (_err) {
        return fallbackBody(html);
    }
}

function formatAddressHtml(addr: MessageAddress | null | undefined): string | false {
    if (!addr || (!addr.name && !addr.address)) {
        return false;
    }

    let parts: string[] = [];
    if (addr.name) {
        parts.push(escapeHtml(addr.name));
    }
    if (addr.address) {
        parts.push(`${escapeHtml('<')}<a href="mailto:${escapeHtml(addr.address)}">${escapeHtml(addr.address)}</a>${escapeHtml('>')}`);
    }

    return parts.join(' ');
}

function formatAddressesHtml(input: QuotedMessage['from']): string | false {
    const addresses = ([] as MessageAddress[]).concat(input || []);
    if (!addresses || !addresses.length) {
        return false;
    }

    let list: string[] = [];
    for (let address of addresses) {
        let entry = formatAddressHtml(address);
        if (entry) {
            list.push(entry);
        }
    }
    if (!list.length) {
        return false;
    }
    return list.join(', ');
}

const HTML_RENDERER: HeaderRenderer = {
    escape: escapeHtml,
    isolate,
    addresses: formatAddressesHtml,
    subject: text => `<b>${escapeHtml(text)}</b>`
};

export default function inlineHtml(
    action: InlineAction | string,
    messageContent: string | Buffer | null | undefined,
    messageData: QuotedMessage,
    options?: FormatDateOptions | null
): string {
    options = options || {};

    messageContent = (messageContent || '').toString();

    let originalBody: string | undefined;

    if (messageData.text && !messageData.html) {
        originalBody = textToHtml(messageData.text);
    } else {
        originalBody = getHtmlBody(messageData.html);
    }

    if (!originalBody) {
        return messageContent;
    }

    // remove html headers and stuff
    messageContent = getHtmlBody(messageContent);

    const header = describeHeader(action, messageData.date, options);
    const dir = header.locale.dir === 'rtl' ? ' dir="rtl"' : '';

    let headers: string[] = [];

    switch (header.kind) {
        case 'forward':
            headers.push(`<div${dir}>${escapeHtml(header.locale.strings.forward)}</div><br class="Apple-interchange-newline">`);

            for (let line of forwardLines(header, messageData, HTML_RENDERER)) {
                headers.push(
                    `<div${dir} style="margin-top: 0px; margin-right: 0px; margin-bottom: 0px; margin-left: 0px;"><span style="font-family: -webkit-system-font, Helvetica Neue, Helvetica, sans-serif; color:rgba(0, 0, 0, 1.0);"><b>${line.label}</b></span><span style="font-family: -webkit-system-font, Helvetica Neue, Helvetica, sans-serif;">${line.value}<br></span></div>`
                );
            }
            break;
        case 'reply':
            headers.push(`<div${dir}>${replyLine(header, messageData.from, HTML_RENDERER)}</div>`);
            break;
    }

    return `<html>

<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>

<body style="word-wrap: break-word; -webkit-nbsp-mode: space; line-break: after-white-space;">${messageContent}<br>
    <div><br>
        <blockquote type="cite" class="ee-block-1">
${headers.join('\n')}<br>
            <div>${originalBody}</div>
        </blockquote>
    </div>
</body>

</html>`;
}
