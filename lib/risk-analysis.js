'use strict';

const packageData = require('../package.json');
const htmlToText = require('../lib/html-to-text');
const nodeFetch = require('node-fetch');
const fetchCmd = global.fetch || nodeFetch;

const MAX_TEXT_LENGTH = 4 * 1024;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `
I want you to act as are an IT security expert that monitors emails for suspicious and risky activity.
`
    .replace(/\s+/g, ' ')
    .trim();

const USER_PROMPT = `
Instructions:
- You are an IT security expert.
- Your task is to monitor and analyze incoming emails which consist of the message headers, a list of attachments, and text content
- Your analysis should contain (but is not limited to) the following:
  - Does the email include links with domain names that contain typos or homoglyphs that might mislead the user about the actual target of the link
  - Does the sender address of the email match the persona or organization the sender email claims to be
  - Does the email promise the user extremely good financial outcome
  - Does the email promise unclaimed money or goods
  - Does the email suggest there is a severe penalty if the user does not act as requested
  - Does the email claim that there are technical issues with the user's email account
  - Does the email offer services or activities that are not suitable for underage persons
  - Does the sender email look like a throwaway address
  - Does the email contain attachments where the name of the attachment might be misleading and suggest a different file format than is actually used
- Provide a risk score for the email using the following scale: 1 - 5 (where 1 is low rist, and 5 is high risk), take into account what may happen if a user acts by the instructions given in the email.
- Respond with a JSON formatted structure with numeric risk score as "risk" property, and a single-paragraph assessment as the "assessment" property. Do not write any other explanations.

Facts:
- An email consists of message headers, attachments list, and text content
- Throwaway email addresses might contain a word or a name and more than one number in the username of the email address
- Throwaway email addresses might use a randomly generated or hex text string as the username of the email address
- Throwaway email addresses might use free email services like gmail.com, outlook.com, hotmail.com, yahoo.com, aol.com etc
- The email to analyze is formatted in a JSON format
- The email structure includes a property "headers" that contains an array of header values.
- Each header contains of two properties, "key" as the header field key name, and "value" as the header value without the key prefix
- The email structure includes a property "attachments" that contains an array of attachments.
- Each attachment includes a "filename" property that describes the file name, "contentType" property that describes the Content-Type value of the attachment
- The email includes a "text" property for the text content

Analyze the following email:
`.trim();

async function riskAnalysis(message, apiToken) {
    let text = message.text;
    if (message.html && (!text || message.html.length > text.length * 2)) {
        text = htmlToText(message.html);
    }

    text = text.trim();
    if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH);
    }

    const headerSeen = new Set();
    const content = {
        headers: []
            .concat(message.headers || [])
            .filter(
                // remove unneeded
                header =>
                    ![
                        'x-received',
                        'received',
                        'dkim-signature',
                        'domainkey-signature',
                        'arc-seal',
                        'arc-message-signature',
                        'arc-authentication-results',
                        'x-google-dkim-signature'
                    ].includes(header.key)
            )
            .filter(header => {
                // only keept the latest
                if (['authentication-results'].includes(header.key)) {
                    if (headerSeen.has(header.key)) {
                        return false;
                    }
                    headerSeen.add(header.key);
                }
                return true;
            }),
        attachments: [].concat(message.attachments || []).map(attachment => ({ filename: attachment.filename, contentType: attachment.contentType })),
        text
    };

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

${JSON.stringify(content)}`
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

    let values;
    const output =
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

    try {
        values = JSON.parse(output);
        values.risk = Number(values.risk) || -1;
    } catch (err) {
        let error = new Error('Failed to parse output from OpenAI API');
        error.textContent = output;
        throw error;
    }

    const response = Object.assign({ id: null, tokens: null }, values, {
        id: data && data.id,
        tokens: data && data.usage && data.usage.total_tokens
    });

    return response;
}

module.exports = riskAnalysis;
