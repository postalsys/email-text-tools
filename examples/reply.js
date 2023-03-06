'use strict';

const fs = require('fs').promises;
const extractReply = require('../lib/extract-reply');
const simpleParser = require('mailparser').simpleParser;

async function main() {
    const eml = await fs.readFile(process.argv[2]);

    const parsed = await simpleParser(eml);

    const replyText = await extractReply(
        {
            html: parsed.html,
            text: parsed.text
        },
        process.env.OPENAI_API_KEY
    );

    console.log(replyText);
}

main();
