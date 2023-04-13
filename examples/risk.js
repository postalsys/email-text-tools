'use strict';

const fs = require('fs').promises;
const { riskAnalysis } = require('..');
const simpleParser = require('mailparser').simpleParser;
const libmime = require('libmime');

async function main() {
    const eml = await fs.readFile(process.argv[2]);

    const parsed = await simpleParser(eml);

    const result = await riskAnalysis(
        {
            headers: parsed.headerLines.map(header => libmime.decodeHeader(header.line)),
            attachments: parsed.attachments,
            html: parsed.html,
            text: parsed.text
        },
        process.env.OPENAI_API_KEY
    );

    console.log(result);
}

main();
