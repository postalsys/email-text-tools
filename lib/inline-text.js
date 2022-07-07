'use strict';

const moment = require('moment-timezone');
const htmlToText = require('./html-to-text');

function formatAddressText(addr) {
    if (!addr || (!addr.name && !addr.address)) {
        return false;
    }

    let parts = [];
    if (addr.name) {
        parts.push(addr.name);
    }

    if (addr.address) {
        parts.push(`<${addr.address}>`);
    }

    return parts.join(' ');
}

function formatAddressesText(addresses) {
    addresses = [].concat(addresses || []);
    if (!addresses || !addresses.length) {
        return false;
    }
    let list = [];
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

function escapeText(text) {
    return '> ' + text.replace(/\r?\n/g, '\n> ');
}

function inlineText(type, messageContent, messageData, options) {
    options = options || {};

    messageContent = (messageContent || '').toString();

    let originalBody;
    if (!messageData.text && messageData.html) {
        originalBody = htmlToText(messageData.html);
    } else {
        originalBody = messageData.text;
    }

    if (!originalBody) {
        return messageContent;
    }

    let headerLines = [];

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
        let dateElm = moment(messageData.date);

        if (options.locale) {
            dateElm = dateElm.locale(options.locale);
        }

        if (options.tz) {
            dateElm = dateElm.tz(options.tz);
        }

        dateStr = dateElm.format('llll');

        let entry = {
            title: 'Date',
            content: dateStr
        };
        headerLines.push(entry);
    }

    for (let key of ['to', 'cc', 'bcc']) {
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

    let headers = [];

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

module.exports = inlineText;
