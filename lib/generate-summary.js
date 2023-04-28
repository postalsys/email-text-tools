'use strict';

const packageData = require('../package.json');
const htmlToText = require('../lib/html-to-text');
const nodeFetch = require('node-fetch');
const GPT3Tokenizer = require('gpt3-tokenizer').default;

const fetchCmd = global.fetch || nodeFetch;

const tokenizer = new GPT3Tokenizer({ type: 'gpt3' });

const MAX_ALLOWED_TEXT_LENGTH = 32 * 1024;
const MAX_ALLOWED_TOKENS = 4000;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `
I want you to act as an email client that processes emails and highlights important parts.
You do not comment or explain anything.
`
    .replace(/\s+/g, ' ')
    .trim();

const USER_PROMPT = `
Instructions:
- You are an executive assistant scanning incoming emails to inform your superiors about what is important and what is not.
- Your task is to monitor and analyze incoming emails, which consist of the message headers, a list of attachments, and text content
- Describe the sentiment of the email using one word. Use either "positive", "neutral" or "negative". Include this value in the response as a "sentiment" property.
- Generate a one-sentence summary of the email. Include this value in the response as a "summary" property.
- Does it seem like the sender of the email would expect a reply to this email? Include this information in the response as a "shouldReply" property with the value "true" if they expect it and "false" if not.
- If this email is a reply to a previous email, then extract the text content that only the email's sender wrote, and include this as a "replyText" property in the response.
- Do not include message signatures in the extracted reply text
- Respond with a JSON formatted structure. Do not write any other explanations.

Facts:
- An email consists of message headers, an attachments list, and text content
- The email to analyze is formatted in a JSON format
- An email is a reply to a previous email only if it includes a "in-reply-to" header
- The email structure includes a property "headers" that contains an array of header values.
- Each header contains two properties, "key" as the header field key name and "value" as the header value without the key prefix
- The email structure includes a property "attachments" that contains an array of attachments.
- Each attachment includes a "filename" property that describes the file name, a "contentType" property that describes the Content-Type value of the attachment
- The email includes a "text" property for the text content

Analyze the following email:
`.trim();

async function generateSummary(message, apiToken, opts) {
    opts = opts || {};

    let maxAllowedTokens = opts.maxTokens || MAX_ALLOWED_TOKENS;
    let gptModel = opts.gptModel || 'gpt-3.5-turbo';

    let text = message.text || '';
    if (message.html && (!text || message.html.length > text.length * 2)) {
        text = htmlToText(message.html);
    }

    let prompt;

    const content = {
        headers: [].concat(message.headers || []).filter(
            // use a whitelist
            header => ['from', 'to', 'cc', 'bcc', 'subject', 'mime-version', 'date', 'content-type', 'list-id'].includes(header.key)
        ),
        attachments: [].concat(message.attachments || []).map(attachment => ({ filename: attachment.filename, contentType: attachment.contentType }))
    };

    let charactersRemoved = 0;
    let promptText = text;

    if (promptText.length > MAX_ALLOWED_TEXT_LENGTH) {
        charactersRemoved += promptText.length - MAX_ALLOWED_TEXT_LENGTH;
        promptText = promptText.substr(0, MAX_ALLOWED_TEXT_LENGTH);
    }

    while (promptText.length) {
        content.text = promptText;
        prompt = `${USER_PROMPT}

${JSON.stringify(content)}`;

        let tokens = tokenizer.encode(prompt);
        if (tokens.text.length <= maxAllowedTokens) {
            break;
        }
        if (promptText.length > 2 * 1024 * 1024) {
            promptText = promptText.substring(0, promptText.length - 1024 * 1024);
            charactersRemoved += 1024 * 1024;
        } else if (promptText.length > 2 * 1024) {
            promptText = promptText.substring(0, promptText.length - 1024);
            charactersRemoved += 1024;
        } else if (promptText.length > 2 * 256) {
            promptText = promptText.substring(0, promptText.length - 256);
            charactersRemoved += 255;
        } else if (promptText.length > 2 * 100) {
            promptText = promptText.substring(0, promptText.length - 100);
            charactersRemoved += 100;
        } else if (promptText.length > 2 * 10) {
            promptText = promptText.substring(0, promptText.length - 10);
            charactersRemoved += 10;
        } else if (promptText.length > 1) {
            promptText = promptText.substring(0, promptText.length - 1);
            charactersRemoved += 1;
        } else {
            throw new Error(`Prompt too long. Removed ${charactersRemoved} characters.`);
        }
    }

    let headers = {
        'User-Agent': `${packageData.name}/${packageData.version}`,
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
    };

    let payload = {
        model: gptModel,
        messages: [
            {
                role: 'system',
                content: `${SYSTEM_PROMPT}`
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    };

    const reqStartTime = Date.now();

    let res = await fetchCmd(OPENAI_API_URL, {
        method: 'post',
        headers,
        body: JSON.stringify(payload)
    });

    const reqEndTime = Date.now();

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
        if (typeof values.shouldReply === 'string') {
            values.shouldReply = values.shouldReply === 'true';
        }
    } catch (err) {
        let error = new Error('Failed to parse output from OpenAI API');
        error.textContent = output;
        throw error;
    }

    const response = Object.assign({ id: null, tokens: null, model: null }, values, {
        id: data && data.id,
        tokens: data && data.usage && data.usage.total_tokens,
        model: gptModel,

        _text: content.text,
        _time: reqEndTime - reqStartTime,
        _cr: charactersRemoved
    });

    return response;
}

module.exports = generateSummary;
