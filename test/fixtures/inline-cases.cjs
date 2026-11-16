'use strict';

// Inputs of the byte-for-byte compatibility fixtures in inline-english.json. The fixtures were
// recorded from the release before the headers were localized (3.0.2), so they pin what an
// English reply or forward looked like when the text was hardcoded.
//
// Re-record only for a deliberate change of the English output:
//   UPDATE_INLINE_COMPAT_FIXTURES=true node --test test/inline-compat.test.cjs

const MESSAGES = {
    full: {
        from: { name: 'Jane Doe', address: 'jane@example.com' },
        to: [{ name: 'Ann Bee', address: 'ann@example.com' }, { address: 'bob@example.com' }],
        cc: { name: 'Carl <Cee>', address: 'carl@example.com' },
        bcc: [{ address: 'dee@example.com' }],
        subject: 'Hello & welcome <all>',
        date: new Date('2024-06-15T14:30:00Z'),
        text: 'Original line 1\nOriginal line 2',
        html: '<html><body><p>Original <b>body</b></p></body></html>'
    },
    textOnly: {
        from: { address: 'jane@example.com' },
        subject: 'Plain',
        date: '2026-01-05T00:05:00Z',
        text: 'Just text'
    },
    leapNoon: {
        from: [{ name: 'Jane Doe', address: 'jane@example.com' }, { name: 'Second Author' }],
        date: Date.UTC(2024, 1, 29, 12, 0),
        text: 'Noon on a leap day',
        html: '<p>Noon on a leap day</p>'
    }
};

const LOCALES = [undefined, 'en', 'en-GB'];
const ZONES = ['UTC', 'America/New_York', 'Asia/Kolkata'];
const ACTIONS = ['reply', 'forward'];

function listCases() {
    const cases = [];
    for (const message of Object.keys(MESSAGES)) {
        for (const action of ACTIONS) {
            for (const locale of LOCALES) {
                for (const tz of ZONES) {
                    cases.push({ id: [message, action, locale || 'default', tz].join('|'), message, action, locale, tz });
                }
            }
        }
    }
    return cases;
}

function render(tools, entry) {
    const options = { tz: entry.tz };
    if (entry.locale) {
        options.locale = entry.locale;
    }
    const message = MESSAGES[entry.message];
    return {
        text: tools.inlineText(entry.action, 'New text', message, options),
        html: tools.inlineHtml(entry.action, '<p>New <i>content</i></p>', message, options)
    };
}

module.exports = { MESSAGES, listCases, render };
