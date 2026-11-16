'use strict';

// The translated reply and forward headers. Expected values are written out or come from
// recorded fixtures, never from Intl, so the file passes unchanged on a Node.js build that only
// carries English ICU data, which is what a @yao-pkg/pkg binary is.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { inlineText, inlineHtml } = require('..');
const { resolveInlineLocale, fillTemplate, INLINE_LOCALE_KEYS } = require('@postalsys/email-text-tools/lib/inline-locales');
const { DATE_DATA } = require('@postalsys/email-text-tools/lib/date-data');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'inline-localized.json');

// The 24 official languages of the EU without Maltese (not shipped yet, see inline-locales.ts),
// then Ukrainian, Russian and Japanese
const REQUIRED = [
    ...['bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 'el', 'hu', 'ga', 'it', 'lv', 'lt', 'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv'],
    ...['uk', 'ru', 'ja']
];

const STRING_KEYS = ['replyDated', 'replyUndated', 'forward', 'from', 'subject', 'date', 'to', 'cc', 'bcc', 'separator'];

const MESSAGE = {
    from: { name: 'Jane Doe', address: 'jane@example.com' },
    to: [{ name: 'Ann Bee', address: 'ann@example.com' }],
    cc: { address: 'carl@example.com' },
    bcc: { address: 'dee@example.com' },
    subject: 'Quarterly report',
    date: new Date('2026-11-16T09:45:00Z'),
    text: 'Original text',
    html: '<p>Original text</p>'
};

const placeholders = text => (text.match(/\{[^}]*\}/g) || []).sort();
const headerOf = text => text.split('\n')[2];

function renderAll(tools, key) {
    const options = { locale: key, tz: 'UTC' };
    const undated = Object.assign({}, MESSAGE, { date: null });
    return {
        replyText: tools.inlineText('reply', 'New', MESSAGE, options),
        replyHtml: tools.inlineHtml('reply', '<p>New</p>', MESSAGE, options),
        undatedReplyText: tools.inlineText('reply', 'New', undated, options),
        forwardText: tools.inlineText('forward', 'New', MESSAGE, options),
        forwardHtml: tools.inlineHtml('forward', '<p>New</p>', MESSAGE, options)
    };
}

describe('inline locales', () => {
    describe('registry', () => {
        it('should have date patterns for exactly the translated entries', () => {
            assert.deepEqual(Object.keys(DATE_DATA).sort(), INLINE_LOCALE_KEYS.slice().sort());
            assert.equal(INLINE_LOCALE_KEYS.length, 55);
        });

        it('should have every string of every entry', () => {
            for (const key of INLINE_LOCALE_KEYS) {
                const locale = resolveInlineLocale(key);
                assert.equal(locale.key, key);
                assert.deepEqual(Object.keys(locale.strings), STRING_KEYS, key);
                assert.equal(locale.dates, DATE_DATA[key], key);
                for (const name of STRING_KEYS) {
                    const value = locale.strings[name];
                    assert.ok(typeof value === 'string' && value.trim().length, `${key}.${name}`);
                    assert.equal(value, value.normalize('NFC'), `${key}.${name} is NFC`);
                    // markers of the formats the reference translations use, and invisible characters
                    assert.doesNotMatch(value, /#\d|%\d?\$?[sd@]|\$[a-z{]|[\u0000-\u001f​-‏‪-‮⁦-⁩﻿]/i, `${key}.${name}`);
                }
            }
        });

        it('should only use the placeholders each template has', () => {
            for (const key of INLINE_LOCALE_KEYS) {
                const { strings } = resolveInlineLocale(key);
                assert.deepEqual(placeholders(strings.replyDated), ['{author}', '{date}', '{time}'], `${key}.replyDated`);
                assert.deepEqual(placeholders(strings.replyUndated), ['{author}'], `${key}.replyUndated`);
                for (const name of STRING_KEYS.slice(2)) {
                    assert.doesNotMatch(strings[name], /[{}]/, `${key}.${name}`);
                }
            }
        });

        it('should mark Arabic and Hebrew as right-to-left and nothing else', () => {
            assert.deepEqual(
                INLINE_LOCALE_KEYS.filter(key => resolveInlineLocale(key).dir === 'rtl'),
                ['ar', 'he']
            );
        });

        it('should cover the required languages with an entry of their own', () => {
            for (const key of REQUIRED) {
                assert.equal(resolveInlineLocale(key).key, key);
            }
            for (const key of REQUIRED.filter(key => key !== 'en')) {
                assert.notEqual(resolveInlineLocale(key).strings.replyUndated, '{author} wrote:', key);
            }
        });

        it('should fall back to English for the languages left out on purpose', () => {
            // Maltese is listed first: adding it has to be a decision that edits this test
            for (const key of ['mt', 'fa', 'th', 'rm', 'km', 'uz', 'pa', 'gd', 'br']) {
                assert.equal(resolveInlineLocale(key).key, 'en', key);
            }
        });
    });

    describe('locale resolution', () => {
        const cases = {
            sv: 'sv',
            'sv-SE': 'sv',
            sv_se: 'sv',
            'SV-fi': 'sv',
            ' de-CH ': 'de',
            'fr-CA': 'fr',
            'pt-BR': 'pt',
            'pt-PT': 'pt',
            'es-419': 'es',
            no: 'nb',
            'no-NO': 'nb',
            nb: 'nb',
            nn: 'nn',
            iw: 'he',
            in: 'id',
            en: 'en',
            'en-US': 'en',
            'en-GB': 'en-GB',
            en_gb: 'en-GB',
            'en-Latn-GB': 'en-GB',
            'en-GB-u-hc-h12': 'en-GB',
            'en-AU': 'en',
            'en-IE': 'en',
            zh: 'zh',
            'zh-CN': 'zh',
            'zh-SG': 'zh',
            'zh-TW': 'zh-Hant',
            'zh-HK': 'zh-Hant',
            'zh-MO': 'zh-Hant',
            'zh-Hant': 'zh-Hant',
            'zh-Hant-HK': 'zh-Hant',
            'zh-Hant-CN': 'zh-Hant',
            'zh-Hans': 'zh',
            'zh-Hans-TW': 'zh',
            zh_hant_tw: 'zh-Hant',
            'zh-u-ca-chinese': 'zh',
            'zh-TW-u-nu-hanidec': 'zh-Hant',
            'sr-Latn': 'sr',
            'sr-Cyrl-RS': 'sr',
            'ja-JP-mac': 'ja',
            'ja-JP-u-ca-japanese': 'ja',
            'ar-EG-u-nu-arab': 'ar',
            'th-TH-u-ca-buddhist': 'en',
            mt: 'en',
            xx: 'en',
            '': 'en',
            '-': 'en',
            'sv--SE': 'en',
            'sv SE': 'en',
            'sv-SE!': 'en',
            'sv\n': 'sv',
            __proto__: 'en',
            constructor: 'en',
            toString: 'en',
            hasOwnProperty: 'en'
        };

        for (const [input, expected] of Object.entries(cases).concat([['__proto__', 'en']])) {
            it(`should resolve ${JSON.stringify(input)} to ${expected}`, () => {
                assert.equal(resolveInlineLocale(input).key, expected);
            });
        }

        it('should resolve anything that is not a usable string to English', () => {
            for (const input of [undefined, null, 0, 1, true, {}, [], ['sv'], () => 'sv', 'a'.repeat(65), 'sv-' + 'a'.repeat(9)]) {
                assert.equal(resolveInlineLocale(input).key, 'en');
            }
        });

        it('should use one resolution for the words and the date', () => {
            assert.equal(
                headerOf(inlineText('reply', 'x', MESSAGE, { locale: 'sv_SE', tz: 'UTC' })),
                '> Den mån 16 nov. 2026 kl. 9:45 skrev Jane Doe <jane@example.com>:'
            );
            assert.equal(
                headerOf(inlineText('reply', 'x', MESSAGE, { locale: 'zh-HK', tz: 'UTC' })),
                '> Jane Doe <jane@example.com> 於 2026年11月16日週一 上午9:45 寫道：'
            );
            // not shipped: English words and an English date, not English words around a Maltese date
            assert.equal(
                headerOf(inlineText('reply', 'x', MESSAGE, { locale: 'mt', tz: 'UTC' })),
                '> On Mon, Nov 16, 2026, 9:45 AM, Jane Doe <jane@example.com> wrote:'
            );
        });
    });

    describe('rendered headers', () => {
        if (process.env.UPDATE_INLINE_FIXTURES === 'true') {
            const recorded = {};
            for (const key of INLINE_LOCALE_KEYS) {
                recorded[key] = renderAll({ inlineText, inlineHtml }, key);
            }
            fs.writeFileSync(FIXTURE_PATH, JSON.stringify(recorded, null, 4) + '\n');
        }
        const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

        it('should have a recorded rendering of every entry', () => {
            assert.deepEqual(Object.keys(fixtures).sort(), INLINE_LOCALE_KEYS.slice().sort());
        });

        for (const key of INLINE_LOCALE_KEYS) {
            it(`should render ${key} as recorded`, () => {
                assert.deepEqual(renderAll({ inlineText, inlineHtml }, key), fixtures[key]);
            });

            it(`should fill every placeholder of ${key}`, () => {
                const rendered = renderAll({ inlineText, inlineHtml }, key);
                const { strings } = resolveInlineLocale(key);
                for (const [name, output] of Object.entries(rendered)) {
                    assert.doesNotMatch(output, /\{(date|time|author)\}/, name);
                    assert.ok(output.includes('jane@example.com'), name);
                }
                assert.ok(rendered.replyText.includes('2026'));
                assert.ok(!headerOf(rendered.undatedReplyText).includes('2026'));
                assert.equal(
                    headerOf(rendered.undatedReplyText).replace(/[⁨⁩]/g, ''),
                    '> ' + strings.replyUndated.replace('{author}', 'Jane Doe <jane@example.com>')
                );
                for (const name of ['from', 'subject', 'date', 'to', 'cc', 'bcc']) {
                    assert.ok(rendered.forwardText.includes(`\n> ${strings[name]}${strings.separator}`), `${name} label`);
                }
                assert.ok(rendered.forwardText.includes(`> ${strings.forward}\n`));
            });

            it(`should treat reply-all like reply in ${key}`, () => {
                const options = { locale: key, tz: 'UTC' };
                assert.equal(inlineText('reply-all', 'New', MESSAGE, options), inlineText('reply', 'New', MESSAGE, options));
                assert.equal(inlineHtml('reply-all', '<p>New</p>', MESSAGE, options), inlineHtml('reply', '<p>New</p>', MESSAGE, options));
            });
        }

        it('should write the documented examples', () => {
            const reply = locale => headerOf(inlineText('reply', 'x', MESSAGE, { locale, tz: 'Europe/Stockholm' }));
            assert.equal(reply('sv'), '> Den mån 16 nov. 2026 kl. 10:45 skrev Jane Doe <jane@example.com>:');
            assert.equal(reply('nb'), '> Den man. 16. nov. 2026 kl. 10:45 skrev Jane Doe <jane@example.com>:');
            assert.equal(reply('da'), '> Den man. 16. nov. 2026 kl. 10.45 skrev Jane Doe <jane@example.com>:');
            assert.equal(reply('fi'), '> Jane Doe <jane@example.com> kirjoitti ma 16.11.2026 klo 10.45:');
            assert.equal(reply('nl'), '> Op ma 16 nov 2026 om 10:45 schreef Jane Doe <jane@example.com>:');
            assert.equal(reply('de'), '> Am Mo., 16. Nov. 2026 um 10:45 schrieb Jane Doe <jane@example.com>:');
            assert.equal(reply('et'), '> E, 16. november 2026 kell 10:45 kirjutas Jane Doe <jane@example.com>:');
            assert.equal(reply('ja'), '> 2026年11月16日(月) 10:45 に Jane Doe <jane@example.com> さんは書きました:');
        });

        it('should use the separator of the language between a label and its value', () => {
            const forward = locale => inlineText('forward', 'x', MESSAGE, { locale, tz: 'UTC' });
            assert.ok(forward('fr').includes('\n> De : Jane Doe <jane@example.com>\n> Objet : Quarterly report\n'));
            assert.ok(forward('zh').includes('\n> 发件人：Jane Doe <jane@example.com>\n> 主题：Quarterly report\n'));
            assert.ok(inlineHtml('forward', 'x', MESSAGE, { locale: 'fr', tz: 'UTC' }).includes('<b>De : </b>'));
        });

        it('should entity-encode translated text in HTML and leave no raw markup from it', () => {
            const html = inlineHtml('reply', '<p>New</p>', MESSAGE, { locale: 'sv', tz: 'UTC' });
            assert.ok(
                html.includes('<div>Den m&aring;n 16 nov. 2026 kl. 9:45 skrev Jane Doe &lt;<a href="mailto:jane@example.com">jane@example.com</a>&gt;:</div>')
            );
        });
    });

    describe('right-to-left headers', () => {
        const ISOLATED = /⁨[^⁨⁩]*⁩/g;

        for (const key of ['ar', 'he']) {
            it(`should mark the ${key} headers and isolate the inserted values in HTML`, () => {
                const options = { locale: key, tz: 'UTC' };
                const reply = inlineHtml('reply', '<p>New</p>', MESSAGE, options);
                const line = reply.match(/<div dir="rtl">(.*)<\/div>/)[1];
                // date, time and author, each in its own isolate
                assert.equal(line.match(/<bdi>/g).length, 3);
                assert.ok(line.includes('<bdi>Jane Doe &lt;<a href="mailto:jane@example.com">jane@example.com</a>&gt;</bdi>'));

                const undated = inlineHtml('reply', '<p>New</p>', Object.assign({}, MESSAGE, { date: null }), options);
                assert.equal(undated.match(/<div dir="rtl">(.*)<\/div>/)[1].match(/<bdi>/g).length, 1);

                const forward = inlineHtml('forward', '<p>New</p>', MESSAGE, options);
                // the opening line and the six headers
                assert.equal(forward.match(/<div dir="rtl"/g).length, 7);
                assert.equal(forward.match(/<bdi>/g).length, 6);
                // the quoted message itself keeps its own direction
                assert.ok(forward.includes('<div><p>Original text</p></div>'));
                assert.doesNotMatch(forward, /<blockquote[^>]*dir=/);
            });

            it(`should isolate the inserted values of ${key} in plain text`, () => {
                const options = { locale: key, tz: 'UTC' };
                const reply = headerOf(inlineText('reply', 'New', MESSAGE, options));
                assert.equal(reply.match(ISOLATED).length, 3);
                assert.ok(reply.includes('⁨Jane Doe <jane@example.com>⁩'));

                // an undated line starts with the author in Arabic and Hebrew word order or not,
                // either way the Latin name is isolated and can not set the direction of the line
                const undated = headerOf(inlineText('reply', 'New', Object.assign({}, MESSAGE, { date: null }), options));
                assert.equal(undated.match(ISOLATED).length, 1);

                const forward = inlineText('forward', 'New', MESSAGE, options);
                assert.equal(forward.match(ISOLATED).length, 6);
                assert.ok(forward.endsWith('>\n> Original text'));
            });
        }

        it('should not add direction markup or isolates to left-to-right languages', () => {
            for (const key of INLINE_LOCALE_KEYS.filter(key => key !== 'ar' && key !== 'he')) {
                const rendered = renderAll({ inlineText, inlineHtml }, key);
                for (const [name, output] of Object.entries(rendered)) {
                    assert.doesNotMatch(output, /dir=|<bdi>|[⁦-⁩‎‏‪-‮]/, `${key} ${name}`);
                }
            }
        });

        it('should isolate a right-to-left author as well', () => {
            const message = Object.assign({}, MESSAGE, { from: { name: 'דנה כהן', address: 'dana@example.com' } });
            const reply = headerOf(inlineText('reply', 'New', message, { locale: 'ar', tz: 'UTC' }));
            assert.ok(reply.includes('⁨דנה כהן <dana@example.com>⁩'));
        });
    });

    describe('dates', () => {
        const reply = (date, options) => headerOf(inlineText('reply', 'x', { from: { name: 'J' }, text: 'o', date }, Object.assign({ tz: 'UTC' }, options)));
        const forward = (date, options) => inlineText('forward', 'x', { from: { name: 'J' }, text: 'o', date }, Object.assign({ tz: 'UTC' }, options));

        it('should format a timestamp of zero, which is a date', () => {
            assert.equal(reply(0), '> On Thu, Jan 1, 1970, 12:00 AM, J wrote:');
            assert.ok(forward(0).includes('\n> Date: Thu, Jan 1, 1970, 12:00 AM\n'));
            assert.ok(
                inlineHtml('reply', 'x', { from: { name: 'J' }, text: 'o', date: 0 }, { tz: 'UTC' }).includes(
                    '<div>On Thu, Jan 1, 1970, 12:00 AM, J wrote:</div>'
                )
            );
        });

        it('should write the undated line for a message without a date', () => {
            for (const date of [undefined, null, '']) {
                assert.equal(reply(date), '> J wrote:');
                assert.equal(reply(date, { locale: 'sv' }), '> J skrev:');
                assert.doesNotMatch(forward(date), /Date:/);
            }
            assert.equal(headerOf(inlineText('reply', 'x', { from: { name: 'J' }, text: 'o' }, {})), '> J wrote:');
            assert.ok(inlineHtml('reply', 'x', { from: { name: 'J' }, text: 'o' }, {}).includes('<div>J wrote:</div>'));
        });

        it('should write the undated line for a date that can not be read', () => {
            for (const date of ['garbage', NaN, new Date('nope')]) {
                assert.equal(reply(date), '> J wrote:');
                assert.equal(reply(date, { locale: 'de' }), '> J schrieb:');
            }
        });

        it('should keep the raw text of an unreadable date in a forwarded Date header', () => {
            assert.ok(forward('garbage').includes('\n> Date: garbage\n'));
            assert.ok(forward('garbage', { locale: 'de' }).includes('\n> Datum: garbage\n'));
            const html = inlineHtml('forward', 'x', { from: { name: 'J' }, text: 'o', date: '<img src=x onerror=alert(1)>' }, {});
            assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
            assert.ok(!html.includes('<img'));
        });

        it('should write no header for an unknown action and leave a message without a body alone', () => {
            assert.equal(inlineText('other', 'x', MESSAGE, { locale: 'sv' }), 'x\n\n> \n>\n> Original text');
            assert.equal(inlineText('reply', 'x', { from: { name: 'J' } }, { locale: 'sv' }), 'x');
            assert.equal(inlineHtml('reply', '<p>x</p>', { from: { name: 'J' } }, { locale: 'sv' }), '<p>x</p>');
        });
    });

    describe('hostile input', () => {
        const NAMES = ['{date}', '{time} {author}', '$&', "$'", '$`', '$1', '$$', '{constructor}', '{__proto__}', '{{date}}', '}{'];

        it('should insert a display name as text, whatever it looks like', () => {
            for (const key of ['en', 'sv', 'fi', 'ja', 'ar', 'zh']) {
                for (const name of NAMES) {
                    const message = { from: { name, address: 'a@example.com' }, text: 'o', date: MESSAGE.date };
                    const line = headerOf(inlineText('reply', 'x', message, { locale: key, tz: 'UTC' })).replace(/[⁨⁩]/g, '');
                    const { strings } = resolveInlineLocale(key);
                    const [before, after] = strings.replyDated.split('{author}');
                    const author = `${name} <a@example.com>`;
                    assert.ok(line.includes(author), `${key} ${name}`);
                    // what surrounds the author is the template with the real date, nothing was expanded twice
                    assert.equal(line.split(author).length, 2, `${key} ${name}`);
                    assert.doesNotMatch(line.split(author).join(''), /\{|\}|\$/, `${key} ${name}`);
                    assert.equal(before.split('{')[0], line.slice(2, 2 + before.split('{')[0].length));
                    assert.ok(line.endsWith(after.slice(after.lastIndexOf('}') + 1)));
                }
            }
        });

        it('should escape names, addresses and subjects in HTML once', () => {
            const message = {
                from: { name: '<script>alert(1)</script> {date} $&', address: '"><img src=x>@example.com' },
                to: { name: '&amp;', address: 'b@example.com' },
                subject: '<b>bold</b> &lt;',
                date: MESSAGE.date,
                html: '<p>o</p>'
            };
            for (const key of ['en', 'sv', 'ar', 'ja']) {
                for (const action of ['reply', 'forward']) {
                    const html = inlineHtml(action, '<p>x</p>', message, { locale: key, tz: 'UTC' });
                    const header = html.slice(html.indexOf('<blockquote'), html.indexOf('<div><p>o</p></div>'));
                    assert.doesNotMatch(header, /<script|<img/, `${key} ${action}`);
                    assert.ok(header.includes('&lt;script&gt;alert(1)&lt;/script&gt; {date} $&amp;'), `${key} ${action}`);
                    assert.doesNotMatch(header, /&amp;(lt|gt|amp);script/, `${key} ${action}`);
                    if (action === 'forward') {
                        assert.ok(header.includes('<b>&lt;b&gt;bold&lt;/b&gt; &amp;lt;</b>'));
                        assert.ok(header.includes('&amp;amp; &lt;<a href="mailto:b@example.com">'));
                    }
                }
            }
        });

        it('should refuse a template with a placeholder it has no value for', () => {
            assert.equal(
                fillTemplate('a {x} b {y}', { x: '1', y: '{x}' }, text => text.toUpperCase()),
                'A 1 B {x}'
            );
            assert.throws(() => fillTemplate('{constructor}', {}, text => text), /Unknown placeholder/);
            // only lowercase names are placeholders, anything else is text of the template
            assert.equal(
                fillTemplate('{toString} {Date}', {}, text => text),
                '{toString} {Date}'
            );
            assert.throws(() => fillTemplate('{author}', { date: 'x' }, text => text), /Unknown placeholder/);
        });
    });
});
