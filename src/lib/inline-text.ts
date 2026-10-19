import formatDate from './format-date.js';
import type { FormatDateOptions } from './format-date.js';
import htmlToText from './html-to-text.js';
import type { InlineAction, MessageAddress, QuotedMessage } from './inline-html.js';

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

    let headerLines: Array<{ title: string; content: string }> = [];

    if (messageData.from) {
        let entry = {
            title: 'From',
            content: formatAddressesText(messageData.from) || '<>'
        };
        headerLines.push(entry);
    }

    if (messageData.subject) {
        let entry = {
            title: 'Subject',
            content: messageData.subject
        };
        headerLines.push(entry);
    }

    let dateStr = '';

    if (messageData.date) {
        dateStr = formatDate(messageData.date, options);

        let entry = {
            title: 'Date',
            content: dateStr
        };
        headerLines.push(entry);
    }

    for (let key of ['to', 'cc', 'bcc'] as const) {
        if (messageData[key]) {
            let content = formatAddressesText(messageData[key]);
            if (content) {
                let entry = {
                    title: key.replace(/^./, c => c.toUpperCase()),
                    content
                };
                headerLines.push(entry);
            }
        }
    }

    let headers: string[] = [];

    switch (type) {
        case 'forward':
            headers.push('Begin forwarded message:\n');

            for (let line of headerLines) {
                headers.push(`${line.title}: ${line.content}`);
            }
            break;
        case 'reply':
            headers.push(`On ${dateStr}, ${formatAddressesText(messageData.from) || '<>'} wrote:\n`);
            break;
    }

    return `${messageContent}

${escapeText(headers.join('\n'))}
>
${escapeText(originalBody)}`;
}
