'use strict';

const sourceMessage = require('./fixtures/message-1.json');

const { inlineHtml } = require('..');

const messageContent = `<h1>Hello world!</h1>

<p>Sent from my iPhone</p>`;

let messageData = {
    text: sourceMessage.text && sourceMessage.text.plain,
    html: sourceMessage.text && sourceMessage.text.html
};
for (let key of ['from', 'to', 'cc', 'bcc', 'date', 'subject']) {
    messageData[key] = sourceMessage[key];
}

let inlinedHtml = inlineHtml('forward', messageContent, messageData, {
    locale: 'et',
    tz: 'Europe/Tallinn'
});

console.log(inlinedHtml);
