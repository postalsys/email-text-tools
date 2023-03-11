'use strict';

const packageData = require('../package.json');
const htmlToText = require('../lib/html-to-text');
const nodeFetch = require('node-fetch');
const fetchCmd = global.fetch || nodeFetch;

const MAX_TEXT_LENGTH = 6 * 1024;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `
I want you to act as an email client that processes emails and highlights important parts.
You do not comment or explain anything.
`
    .replace(/\s+/g, ' ')
    .trim();

const USER_PROMPT = `
Describe the sentiment of the email using one word. Use either "positive", "neutral" or "negative". Prefix the sentiment with "Sentiment:".
On a separate line, write a one-sentence summary of the email. Prefix the summary with "Summary:".
I want you to only reply with the sentiment and summary, do not write explanations. 
All the text that follows from now on is the email message:
`
    .replace(/\s+/g, ' ')
    .trim();

async function generateSummary(message, apiToken) {
    let text = message.text;
    if (!text && message.html) {
        text = htmlToText(message.text);
    }

    text = text.trim();
    if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH);
    }

    let headers = {
        'User-Agent': `${packageData.name}/${packageData.version}`,
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
    };

    let payload = {
        model: 'gpt-3.5-turbo',
        messages: [
            {
                role: 'system',
                content: `${SYSTEM_PROMPT}`
            },
            {
                role: 'user',
                content: `${USER_PROMPT}

${text}`
            }
        ]
    };

    let res = await fetchCmd(OPENAI_API_URL, {
        method: 'post',
        headers,
        body: JSON.stringify(payload)
    });

    let data = await res.json();

    if (!res.ok) {
        if (data && data.error) {
            let error = new Error(data.error.message || data.error);
            if (data.error.code) {
                error.code = data.error.code;
            }

            error.statusCode = res.status;
            throw error;
        }

        let error = new Error('Failed to run API request');
        error.statusCode = res.status;
        throw error;
    }

    if (!data) {
        throw new Error(`Failed to POST API request`);
    }

    let output =
        data &&
        data.choices &&
        data.choices
            .filter(msg => msg && msg.message && msg.message.role === 'assistant' && msg.message.content)
            .sort((a, b) => ((a && a.index) || 0) - ((b && b.index) || 0))
            .map(msg => msg.message.content)
            .join('\n')
            .trim()
            .replace(/^\s*"|"\s*$/g, '')
            .trim();

    let structured = {};

    let summaryMatch = output.match(/\bsummary:\s*(.*)$/im);
    if (summaryMatch) {
        structured.summary = summaryMatch[1].replace(/^["'\s]+|["'\s]+$/g, '');
    }

    let sentimentMatch = output.match(/\bsentiment:\s*(.*)$/im);
    if (sentimentMatch) {
        structured.sentiment = sentimentMatch[1].replace(/^["'\s]+|["'\s]+$/g, '').toLowerCase();
    }

    const response = Object.assign(
        {
            id: data && data.id,
            tokens: data && data.usage && data.usage.total_tokens
        },
        structured
    );

    return response;
}

module.exports = generateSummary;
