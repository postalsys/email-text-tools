'use strict';

const fs = require('fs').promises;
const generateSummary = require('../lib/generate-summary');
const simpleParser = require('mailparser').simpleParser;

async function main() {
    const eml = await fs.readFile(process.argv[2]);

    const parsed = await simpleParser(eml);

    const summary = await generateSummary(
        {
            html: parsed.html,
            text: parsed.text
        },
        process.env.OPENAI_API_KEY
    );

    console.log(summary);
}

main();
