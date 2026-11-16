import type { FormatDateOptions } from './format-date.js';
import htmlToText from './html-to-text.js';
import { describeHeader, forwardLines, replyLine } from './inline-header.js';
import type { HeaderRenderer } from './inline-header.js';
import type { InlineAction, MessageAddress, QuotedMessage } from './inline-html.js';

// In a right-to-left header an inserted name, address or date is wrapped in FIRST STRONG ISOLATE
// and POP DIRECTIONAL ISOLATE: without them the angle brackets of an address reorder around it,
// and a line that starts with a Latin name would be laid out left to right as a whole
function isolate(text: string): string {
    return '\u2068' + text + '\u2069';
}

function asIs(text: string): string {
    return text;
}

function formatAddressText(addr: MessageAddress | null | undefined): string | false {
    if (!addr || (!addr.name && !addr.address)) {
        return false;
    }

    let parts: string[] = [];
    if (addr.name) {
        parts.push(addr.name);
    }

    if (addr.address) {
        parts.push(`<${addr.address}>`);
    }

    return parts.join(' ');
}

function formatAddressesText(input: QuotedMessage['from']): string | false {
    const addresses = ([] as MessageAddress[]).concat(input || []);
    if (!addresses || !addresses.length) {
        return false;
    }
    let list: string[] = [];
    for (let address of addresses) {
        let entry = formatAddressText(address);
        if (entry) {
            list.push(entry);
        }
    }
    if (!list.length) {
        return false;
    }
    return list.join(', ');
}

// Plain text needs no escaping, only the isolates of a right-to-left header
const TEXT_RENDERER: HeaderRenderer = { escape: asIs, isolate, addresses: formatAddressesText, subject: asIs };

function escapeText(text: string): string {
    return '> ' + text.replace(/\r?\n/g, '\n> ');
}

export default function inlineText(
    type: InlineAction | string,
    messageContent: string | Buffer | null | undefined,
    messageData: QuotedMessage,
    options?: FormatDateOptions | null
): string {
    options = options || {};

    messageContent = (messageContent || '').toString();

    let originalBody: string | null | undefined;
    if (!messageData.text && messageData.html) {
        // passed on as given, a Buffer included
        originalBody = htmlToText(messageData.html as string);
    } else {
        originalBody = messageData.text;
    }

    if (!originalBody) {
        return messageContent;
    }

    const header = describeHeader(type, messageData.date, options);

    let headers: string[] = [];

    switch (header.kind) {
        case 'forward':
            headers.push(header.locale.strings.forward + '\n');

            for (let line of forwardLines(header, messageData, TEXT_RENDERER)) {
                headers.push(line.label + line.value);
            }
            break;
        case 'reply':
            headers.push(replyLine(header, messageData.from, TEXT_RENDERER) + '\n');
            break;
    }

    return `${messageContent}

${escapeText(headers.join('\n'))}
>
${escapeText(originalBody)}`;
}
