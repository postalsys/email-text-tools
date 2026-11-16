'use strict';

// The date table at work. Expected values are literals, so this passes unchanged on a Node.js
// build that only carries English ICU data (a @yao-pkg/pkg binary): the only thing asked of
// Intl is the numbers of the date in a time zone.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const formatDate = require('@postalsys/email-text-tools/lib/format-date');
const { formatDateParts, toValidDate } = require('@postalsys/email-text-tools/lib/date-parts');
const { DATE_DATA, DATE_DATA_SOURCE } = require('@postalsys/email-text-tools/lib/date-data');

const utc = (...args) => new Date(Date.UTC(...args));

describe('date table', () => {
    it('should record what it was generated with', () => {
        for (const key of ['node', 'icu', 'cldr']) {
            assert.match(DATE_DATA_SOURCE[key], /^\d+(\.\d+)*$/, key);
        }
    });

    it('should have complete patterns in every entry', () => {
        for (const [key, entry] of Object.entries(DATE_DATA)) {
            assert.equal(entry.weekdays.length, 7, key);
            assert.equal(entry.months.length, 12, key);
            assert.match(entry.hourCycle, /^h(11|12|23|24)$/, key);
            for (const name of ['date', 'time', 'dateTime']) {
                const fields = entry[name].match(/\{[^}]*\}/g) || [];
                for (const field of fields) {
                    assert.match(field, /^\{(w|y|M|d{1,2}|h{1,2}|m{1,2}|a)\}$/, `${key}.${name}`);
                }
                // no-break spaces were normalized when the table was written
                assert.doesNotMatch(entry[name], /[  ]/, `${key}.${name}`);
            }
            assert.deepEqual((entry.date.match(/\{[^}]*\}/g) || []).map(field => field[1]).sort(), ['M', 'd', 'w', 'y'], key);
            assert.equal(entry.time.includes('{a}'), Boolean(entry.dayPeriods), key);
            if (entry.dayPeriods) {
                assert.equal(entry.dayPeriods.length, 2, key);
                assert.match(entry.hourCycle, /^h1[12]$/, key);
            }
            for (const value of [...entry.weekdays, ...entry.months, ...(entry.dayPeriods || [])]) {
                assert.ok(typeof value === 'string' && value.length, key);
            }
        }
    });

    it('should split a date into the same pieces the combined form is made of', () => {
        const parts = formatDateParts(utc(2024, 5, 15, 14, 30), DATE_DATA.en, 'UTC');
        assert.deepEqual(parts, { date: 'Sat, Jun 15, 2024', time: '2:30 PM', dateTime: 'Sat, Jun 15, 2024, 2:30 PM' });
        assert.deepEqual(formatDateParts(utc(2024, 5, 15, 14, 30), DATE_DATA.fi, 'UTC'), {
            date: 'la 15.6.2024',
            time: '14.30',
            // the combined form has a word of its own between the two
            dateTime: 'la 15.6.2024 klo 14.30'
        });
    });

    it('should be joined into every resolved locale', () => {
        const { resolveInlineLocale, INLINE_LOCALE_KEYS } = require('@postalsys/email-text-tools/lib/inline-locales');
        assert.deepEqual(Object.keys(DATE_DATA).sort(), INLINE_LOCALE_KEYS.slice().sort());
        for (const key of INLINE_LOCALE_KEYS) {
            assert.equal(resolveInlineLocale(key).dates, DATE_DATA[key], key);
        }
        for (const key of ['xx', '__proto__', 'constructor', 'toString', '']) {
            assert.equal(resolveInlineLocale(key).dates, DATE_DATA.en, key);
        }
    });
});

describe('formatDate', () => {
    const en = (date, tz) => formatDate(date, { tz: tz || 'UTC' });

    it('should keep the 12-hour clock straight around midnight and noon', () => {
        assert.equal(en(utc(2026, 0, 5, 0, 0)), 'Mon, Jan 5, 2026, 12:00 AM');
        assert.equal(en(utc(2026, 0, 5, 0, 5)), 'Mon, Jan 5, 2026, 12:05 AM');
        assert.equal(en(utc(2026, 0, 5, 11, 59)), 'Mon, Jan 5, 2026, 11:59 AM');
        assert.equal(en(utc(2026, 0, 5, 12, 0)), 'Mon, Jan 5, 2026, 12:00 PM');
        assert.equal(en(utc(2026, 0, 5, 13, 7)), 'Mon, Jan 5, 2026, 1:07 PM');
        assert.equal(en(utc(2026, 0, 5, 23, 59)), 'Mon, Jan 5, 2026, 11:59 PM');
    });

    it('should keep the 24-hour clock straight around midnight and noon', () => {
        const gb = date => formatDate(date, { locale: 'en-GB', tz: 'UTC' });
        assert.equal(gb(utc(2026, 0, 5, 0, 0)), 'Mon, 5 Jan 2026, 0:00');
        assert.equal(gb(utc(2026, 0, 5, 12, 0)), 'Mon, 5 Jan 2026, 12:00');
        assert.equal(gb(utc(2026, 0, 5, 23, 59)), 'Mon, 5 Jan 2026, 23:59');
        assert.equal(formatDate(utc(2026, 0, 5, 0, 5), { locale: 'ko', tz: 'UTC' }), '2026년 1월 5일 (월) 오전 12:05');
        assert.equal(formatDate(utc(2026, 0, 5, 12, 5), { locale: 'zh-Hant', tz: 'UTC' }), '2026年1月5日週一 下午12:05');
    });

    it('should handle a leap day and both sides of a year boundary', () => {
        assert.equal(en(utc(2024, 1, 29, 12, 0)), 'Thu, Feb 29, 2024, 12:00 PM');
        assert.equal(en(utc(2025, 11, 31, 23, 59)), 'Wed, Dec 31, 2025, 11:59 PM');
        assert.equal(en(utc(2025, 11, 31, 23, 59), 'Pacific/Auckland'), 'Thu, Jan 1, 2026, 12:59 PM');
        assert.equal(en(utc(2026, 0, 1, 0, 30), 'America/Los_Angeles'), 'Wed, Dec 31, 2025, 4:30 PM');
    });

    it('should follow a daylight saving change', () => {
        // Stockholm moves from UTC+1 to UTC+2 at 01:00 UTC on 2026-03-29
        const sv = date => formatDate(date, { locale: 'sv', tz: 'Europe/Stockholm' });
        assert.equal(sv(utc(2026, 2, 29, 0, 59)), 'sön 29 mars 2026 1:59');
        assert.equal(sv(utc(2026, 2, 29, 1, 0)), 'sön 29 mars 2026 3:00');
        // and back at 01:00 UTC on 2026-10-25
        assert.equal(sv(utc(2026, 9, 25, 0, 59)), 'sön 25 okt. 2026 2:59');
        assert.equal(sv(utc(2026, 9, 25, 1, 0)), 'sön 25 okt. 2026 2:00');
    });

    it('should handle time zones that are not whole hours from UTC', () => {
        assert.equal(en(utc(2026, 10, 16, 18, 45), 'Asia/Kolkata'), 'Tue, Nov 17, 2026, 12:15 AM');
        assert.equal(en(utc(2026, 10, 16, 18, 45), 'Asia/Kathmandu'), 'Tue, Nov 17, 2026, 12:30 AM');
        assert.equal(en(utc(2026, 10, 16, 18, 45), 'America/St_Johns'), 'Mon, Nov 16, 2026, 3:15 PM');
    });

    it('should read an unknown time zone as UTC in every language', () => {
        assert.equal(formatDate(utc(2026, 10, 16, 9, 45), { locale: 'sv', tz: 'Not/AZone' }), 'mån 16 nov. 2026 9:45');
        assert.equal(formatDate(utc(2026, 10, 16, 9, 45), { locale: 'sv', tz: '../../etc/passwd' }), 'mån 16 nov. 2026 9:45');
    });

    it('should use the time zone of the host when none is given', () => {
        const script =
            "const formatDate = require('@postalsys/email-text-tools/lib/format-date');" +
            "process.stdout.write(formatDate(new Date('2026-11-16T09:45:00Z'), { locale: 'sv' }) + '|' + formatDate(new Date('2026-11-16T09:45:00Z')));";
        const run = tz => {
            const result = spawnSync(process.execPath, ['-e', script], {
                cwd: path.join(__dirname, '..'),
                env: Object.assign({}, process.env, { TZ: tz }),
                encoding: 'utf8'
            });
            assert.equal(result.status, 0, result.stderr);
            return result.stdout;
        };
        assert.equal(run('UTC'), 'mån 16 nov. 2026 9:45|Mon, Nov 16, 2026, 9:45 AM');
        assert.equal(run('Asia/Tokyo'), 'mån 16 nov. 2026 18:45|Mon, Nov 16, 2026, 6:45 PM');
        assert.equal(run('America/New_York'), 'mån 16 nov. 2026 4:45|Mon, Nov 16, 2026, 4:45 AM');
    });

    it('should format a timestamp of zero and pass an invalid date through', () => {
        assert.equal(en(0), 'Thu, Jan 1, 1970, 12:00 AM');
        assert.equal(formatDate('garbage', { locale: 'sv' }), 'garbage');
        assert.equal(formatDate(NaN), 'NaN');
        assert.equal(toValidDate('garbage'), null);
        assert.equal(toValidDate(0).getTime(), 0);
    });

    it('should format a regional tag as its language, British English aside', () => {
        const date = utc(2024, 5, 15, 14, 30);
        assert.equal(formatDate(date, { locale: 'de-CH', tz: 'UTC' }), formatDate(date, { locale: 'de', tz: 'UTC' }));
        assert.equal(formatDate(date, { locale: 'en-AU', tz: 'UTC' }), 'Sat, Jun 15, 2024, 2:30 PM');
        assert.equal(formatDate(date, { locale: 'en-GB', tz: 'UTC' }), 'Sat, 15 Jun 2024, 14:30');
        // European words, the generic Portuguese date pattern
        assert.equal(formatDate(date, { locale: 'pt-PT', tz: 'UTC' }), 'sáb., 15 de jun. de 2024, 14:30');
    });

    it('should print months the way the language does inside a date', () => {
        const date = utc(2026, 10, 16, 9, 45);
        // not the standalone "nov"
        assert.equal(formatDate(date, { locale: 'et', tz: 'UTC' }), 'E, 16. november 2026, 9:45');
        // a number, although a short month name was asked for
        assert.equal(formatDate(date, { locale: 'cs', tz: 'UTC' }), 'po 16. 11. 2026 9:45');
        assert.equal(formatDate(date, { locale: 'zh', tz: 'UTC' }), '2026年11月16日周一 9:45');
    });

    it('should always write Gregorian years in Latin digits', () => {
        for (const key of Object.keys(DATE_DATA)) {
            const formatted = formatDate(utc(2026, 10, 16, 9, 45), { locale: key, tz: 'UTC' });
            assert.ok(formatted.includes('2026'), `${key}: ${formatted}`);
            assert.doesNotMatch(formatted, /[٠-٩۰-۹०-९]/, key);
        }
    });
});
