// Generates src/lib/date-data.ts, the date and time patterns the quoted message headers are
// formatted with.
//
// The patterns are read from the ICU data of the Node.js this runs on, which has to be a full-ICU
// build. They are stored because a runtime can not be relied on to have them: a single-file
// binary built with @yao-pkg/pkg carries English-only ICU data, where every other language
// formats as broken placeholders ("2026 M11 16").
//
// Run it by hand (npm run generate:dates) and commit the result. It is not part of the build:
// ICU data changes between Node.js versions, and a changed date format in outgoing mail has to
// be a decision, not a side effect of whoever built the package.
//
// Every value comes out of formatToParts() for the exact options the headers use. A standalone
// name is not the same thing: Estonian November is "nov" on its own and "november" inside this
// format, Finnish and Czech print the month as a number, Chinese splits "11" and the month sign
// into a field and a literal.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src', 'lib', 'date-data.ts');

// The entries of the table, the same keys as the translations in src/lib/inline-locales.ts
// (which refuses to load without date patterns for one of its entries). Each key is also the
// locale ICU is asked for: Portuguese words are European but `pt` is on purpose not `pt-PT`,
// whose pattern is all numeric with a full weekday name, while a plain `pt` is what callers
// have always been given.
// prettier-ignore
export const FORMAT_LOCALES = [
    'af', 'ar', 'az', 'be', 'bg', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'en-GB', 'eo',
    'es', 'et', 'eu', 'fi', 'fr', 'fy', 'ga', 'gl', 'he', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja',
    'ka', 'kk', 'ko', 'lt', 'lv', 'mk', 'ms', 'nb', 'nl', 'nn', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl',
    'sq', 'sr', 'sv', 'tr', 'uk', 'vi', 'zh', 'zh-Hant'
];

// The options the headers have always been formatted with (format-date.ts), split three ways:
// a reply line places the date and the time separately, a forwarded Date header uses both.
const DATE_OPTIONS = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
const TIME_OPTIONS = { hour: 'numeric', minute: '2-digit' };
export const PATTERN_OPTIONS = { date: DATE_OPTIONS, time: TIME_OPTIONS, dateTime: { ...DATE_OPTIONS, ...TIME_OPTIONS } };

const FIELD_LETTERS = { weekday: 'w', year: 'y', month: 'M', day: 'd', hour: 'h', minute: 'm', dayPeriod: 'a' };

export function createFormatter(formatLocale, options) {
    const tag = `${formatLocale}-u-ca-gregory-nu-latn`;
    if (!Intl.DateTimeFormat.supportedLocalesOf([tag]).length) {
        throw new Error(`${formatLocale}: this Node.js has no ICU data for the locale, a full-ICU build is needed`);
    }
    const formatter = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...options });
    const resolved = formatter.resolvedOptions();
    if (resolved.locale.replace(/-u-.*$/, '') !== formatLocale || resolved.calendar !== 'gregory' || resolved.numberingSystem !== 'latn') {
        throw new Error(`${formatLocale}: resolved to ${resolved.locale} (${resolved.calendar}, ${resolved.numberingSystem})`);
    }
    return formatter;
}

// The table holds what the library itself writes, so the spaces are the ones it has always
// written: ICU separates "PM" with a narrow no-break space that older mail clients show as a box
export function normalize(text) {
    return text.replace(/[  ]/g, ' ');
}

function utc(year, month, day, hour, minute) {
    return new Date(Date.UTC(year, month, day, hour || 0, minute || 0));
}

function fieldOf(parts, type) {
    const part = parts.find(entry => entry.type === type);
    return part ? normalize(part.value) : undefined;
}

// A numeric field is stored as its width: 1 for "5", 2 for "05"
function widthOf(formatter, date, type, expected) {
    const value = fieldOf(formatter.formatToParts(date), type);
    if (value === String(expected)) {
        return 1;
    }
    if (value === String(expected).padStart(2, '0')) {
        return 2;
    }
    throw new Error(`unexpected ${type} value "${value}" for ${expected}`);
}

function describePattern(formatLocale, options, data) {
    const formatter = createFormatter(formatLocale, options);
    // 2026-11-05 15:07 UTC: single digit day and minute, an afternoon hour
    const sample = utc(2026, 10, 5, 15, 7);
    let pattern = '';

    for (const part of formatter.formatToParts(sample)) {
        if (part.type === 'literal') {
            const literal = normalize(part.value);
            if (/[{}]/.test(literal)) {
                throw new Error(`${formatLocale}: literal with a brace`);
            }
            pattern += literal;
            continue;
        }
        const letter = FIELD_LETTERS[part.type];
        if (!letter) {
            throw new Error(`${formatLocale}: unsupported field "${part.type}"`);
        }
        let width = 1;
        switch (part.type) {
            case 'year':
                if (part.value !== '2026') {
                    throw new Error(`${formatLocale}: year printed as "${part.value}"`);
                }
                break;
            case 'day':
                width = widthOf(formatter, sample, 'day', 5);
                break;
            case 'minute':
                width = widthOf(formatter, sample, 'minute', 7);
                break;
            case 'hour': {
                const cycle = formatter.resolvedOptions().hourCycle;
                if (data.hourCycle && data.hourCycle !== cycle) {
                    throw new Error(`${formatLocale}: hour cycle differs between patterns`);
                }
                data.hourCycle = cycle;
                width = widthOf(formatter, utc(2026, 10, 5, 9, 7), 'hour', 9);
                break;
            }
            default:
                break;
        }
        pattern += `{${letter.repeat(width)}}`;
    }

    // Names are stored once per entry, so every pattern has to print the same ones
    const names = { weekdays: [], months: [], dayPeriods: [] };
    for (let day = 0; day < 7; day++) {
        // 2026-11-01 is a Sunday
        names.weekdays.push(fieldOf(formatter.formatToParts(utc(2026, 10, 1 + day)), 'weekday'));
    }
    for (let month = 0; month < 12; month++) {
        names.months.push(fieldOf(formatter.formatToParts(utc(2026, month, 5)), 'month'));
    }
    for (const hour of [9, 15]) {
        names.dayPeriods.push(fieldOf(formatter.formatToParts(utc(2026, 10, 5, hour, 7)), 'dayPeriod'));
    }
    for (const key of Object.keys(names)) {
        if (names[key].every(value => value === undefined)) {
            continue;
        }
        if (names[key].some(value => value === undefined)) {
            throw new Error(`${formatLocale}: ${key} are not always printed`);
        }
        if (data[key] && data[key].join('\n') !== names[key].join('\n')) {
            throw new Error(`${formatLocale}: ${key} differ between patterns`);
        }
        data[key] = names[key];
    }

    return pattern;
}

function describeLocale(formatLocale) {
    const data = {};
    const entry = {
        date: describePattern(formatLocale, PATTERN_OPTIONS.date, data),
        time: describePattern(formatLocale, PATTERN_OPTIONS.time, data),
        dateTime: describePattern(formatLocale, PATTERN_OPTIONS.dateTime, data),
        hourCycle: data.hourCycle,
        weekdays: data.weekdays,
        months: data.months
    };
    if (data.dayPeriods) {
        entry.dayPeriods = data.dayPeriods;
    }
    return entry;
}

function generate() {
    const entries = {};
    for (const key of FORMAT_LOCALES) {
        entries[key] = describeLocale(key);
    }

    const source = { node: process.versions.node, icu: process.versions.icu, cldr: process.versions.cldr };
    const lines = [
        '// Generated by scripts/generate-date-data.js, do not edit. Regenerate with `npm run generate:dates`.',
        '//',
        '// Date and time patterns of the quoted message headers, one entry per locale the library',
        '// translates to. Derived from the Unicode CLDR data in ICU, see UNICODE-LICENSE.txt.',
        '',
        '/** Date and time patterns of one locale */',
        'export interface DatePatterns {',
        '    /** Pattern of the date alone, fields in braces: w weekday, y year, M month, d day */',
        '    date: string;',
        '    /** Pattern of the time alone: h hour, m minute, a day period */',
        '    time: string;',
        '    /** Pattern of the date and the time together */',
        '    dateTime: string;',
        "    hourCycle: 'h11' | 'h12' | 'h23' | 'h24';",
        '    /** Weekday names as the patterns print them, Sunday first */',
        '    weekdays: string[];',
        '    /** Months as the patterns print them, a name or a number */',
        '    months: string[];',
        '    /** Before noon and after noon, for the patterns that have a day period */',
        '    dayPeriods?: string[];',
        '}',
        '',
        '/** The versions the table was generated with */',
        `export const DATE_DATA_SOURCE = ${JSON.stringify(source)};`,
        '',
        '// prettier-ignore',
        'export const DATE_DATA: Record<string, DatePatterns> = {'
    ];
    const keys = Object.keys(entries);
    keys.forEach((key, index) => {
        lines.push(`    ${JSON.stringify(key)}: ${JSON.stringify(entries[key])}${index < keys.length - 1 ? ',' : ''}`);
    });
    lines.push('};', '');

    fs.writeFileSync(target, lines.join('\n'));
    console.log(`Wrote ${keys.length} entries to ${path.relative(root, target)} (ICU ${source.icu}, CLDR ${source.cldr})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    generate();
}
