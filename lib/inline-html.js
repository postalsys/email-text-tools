'use strict';

const HTMLParser = require('node-html-parser');
const he = require('he');
const formatDate = require('./format-date');
const textToHtml = require('./text-to-html');
const { MAX_NESTING_DEPTH, exceedsNestingDepth, fallbackText } = require('./html-guard');

// Escaped text in place of a body that is not worth parsing
function fallbackBody(html) {
    return `<div style="white-space: pre-wrap;">${he.encode(fallbackText(html), { useNamedReferences: true })}</div>`;
}

function getHtmlBody(html) {
    html = ((html && html.toString()) || '').trim();
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

function formatAddressHtml(addr) {
    if (!addr || (!addr.name && !addr.address)) {
        return false;
    }

    let parts = [];
    if (addr.name) {
        parts.push(he.encode(addr.name, { useNamedReferences: true }));
    }
    if (addr.address) {
        parts.push(
            `${he.encode('<', { useNamedReferences: true })}<a href="mailto:${he.encode(addr.address, { useNamedReferences: true })}">${he.encode(
                addr.address,
                { useNamedReferences: true }
            )}</a>${he.encode('>', { useNamedReferences: true })}`
        );
    }

    return parts.join(' ');
}

function formatAddressesHtml(addresses) {
    addresses = [].concat(addresses || []);
    if (!addresses || !addresses.length) {
        return false;
    }

    let list = [];
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

function inlineHtml(action, messageContent, messageData, options) {
    options = options || {};

    messageContent = (messageContent || '').toString();

    let originalBody;

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

    let headerLines = [];

    if (messageData.from) {
        let entry = {
            title: 'From',
            content: formatAddressesHtml(messageData.from) || he.encode('<>', { useNamedReferences: true })
        };
        headerLines.push(entry);
    }

    if (messageData.subject) {
        let entry = {
            title: 'Subject',
            content: `<b>${he.encode(messageData.subject, { useNamedReferences: true })}</b>`
        };
        headerLines.push(entry);
    }

    let dateStr = '';

    if (messageData.date) {
        dateStr = formatDate(messageData.date, options);

        let entry = {
            title: 'Date',
            content: he.encode(dateStr, { useNamedReferences: true })
        };
        headerLines.push(entry);
    }

    for (let key of ['to', 'cc', 'bcc']) {
        if (messageData[key]) {
            let content = formatAddressesHtml(messageData[key]);
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

    switch (action) {
        case 'forward':
            headers.push(`<div>Begin forwarded message:</div><br class="Apple-interchange-newline">`);

            for (let line of headerLines) {
                headers.push(
                    `<div style="margin-top: 0px; margin-right: 0px; margin-bottom: 0px; margin-left: 0px;"><span style="font-family: -webkit-system-font, Helvetica Neue, Helvetica, sans-serif; color:rgba(0, 0, 0, 1.0);"><b>${line.title}: </b></span><span style="font-family: -webkit-system-font, Helvetica Neue, Helvetica, sans-serif;">${line.content}<br></span></div>`
                );
            }
            break;
        case 'reply':
            headers.push(
                `<div>On ${he.encode(dateStr, { useNamedReferences: true })}, ${
                    formatAddressesHtml(messageData.from) || he.encode('<>', { useNamedReferences: true })
                } wrote:</div>`
            );
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

module.exports = inlineHtml;
