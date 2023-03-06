'use strict';

const packageData = require('../package.json');
const htmlToText = require('../lib/html-to-text');
const nodeFetch = require('node-fetch');
const fetchCmd = global.fetch || nodeFetch;

const MAX_TEXT_LENGTH = 6 * 1024;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const PROMPT = `If the following email message includes a reply text, return it. If the message ends with a courtesy greeting, do not include it in the response. Extract the main content text if the message does not contain a reply. Do not add a comment, only return the message text or an empty response if you can not detect any text content. Here is the email message content:`;

async function extractReply(message, apiToken) {
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
                role: 'user',
                content: `${PROMPT}

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

    console.log('OPENAI RESPONSE', JSON.stringify(data, false, 2));

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

    const response = {
        id: data && data.id,
        tokens: data && data.usage && data.usage.total_tokens,
        text: output
    };

    return response;
}

module.exports = extractReply;
