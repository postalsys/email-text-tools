'use strict';

const sourceMessage = require('./fixtures/message-1.json');

const { inlineText } = require('..');

const messageContent = `Hello world!

Sent from my iPhone`;

let messageData = {
    //text: sourceMessage.text && sourceMessage.text.plain,
    html: sourceMessage.text && sourceMessage.text.html
};
for (let key of ['from', 'to', 'cc', 'bcc', 'date', 'subject']) {
    messageData[key] = sourceMessage[key];
}

let inlinedHtml = inlineText('forward', messageContent, messageData, {
    locale: 'et',
    tz: 'Europe/Tallinn'
});

console.log(inlinedHtml);
