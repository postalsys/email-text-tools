// Checks the generated date table (src/lib/date-data.ts) against the ICU data of the running
// Node.js: every entry, formatted by the library's own code from the build in dist/, has to
// print what Intl.DateTimeFormat prints, for dates the generator did not look at.
//
// Run after a build, on a full-ICU Node.js: `npm run check:dates`. `npm run generate:dates`
// runs it as its last step.
//
// On the Node.js version the table was generated with, a difference is a bug in the generator or
// in the formatter. On another version it can also be ICU data that moved on; then the table is
// regenerated on purpose, and the changed formats are reviewed like any other change to what
// outgoing mail looks like.

import { createRequire } from 'node:module';
import { FORMAT_LOCALES, PATTERN_OPTIONS, createFormatter, normalize } from './generate-date-data.js';

const require = createRequire(import.meta.url);
const { formatDateParts } = require('../dist/cjs/lib/date-parts.js');
const { DATE_DATA, DATE_DATA_SOURCE } = require('../dist/cjs/lib/date-data.js');

// Every hour of the day, with minutes that are zero, single digit and double digit
const TIMES = [];
for (let hour = 0; hour < 24; hour++) {
    TIMES.push([hour, [0, 5, 30, 59][hour % 4]]);
}

function* dates() {
    // 2024 is a leap year, 2026 and 2027 put every date on other weekdays
    for (const year of [2024, 2026, 2027]) {
        const date = new Date(Date.UTC(year, 0, 1));
        let index = 0;
        while (date.getUTCFullYear() === year) {
            const [hour, minute] = TIMES[index++ % TIMES.length];
            yield new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), hour, minute));
            date.setUTCDate(date.getUTCDate() + 1);
        }
    }
    // each time of day on one date as well, the loop above pairs them with different days
    for (const [hour, minute] of TIMES) {
        yield new Date(Date.UTC(2026, 10, 5, hour, minute));
    }
}

function check() {
    const sameVersion = DATE_DATA_SOURCE.icu === process.versions.icu && DATE_DATA_SOURCE.cldr === process.versions.cldr;
    const keys = FORMAT_LOCALES;
    const failures = [];
    let compared = 0;

    const missing = keys.filter(key => !Object.hasOwn(DATE_DATA, key));
    const extra = Object.keys(DATE_DATA).filter(key => !FORMAT_LOCALES.includes(key));
    if (missing.length || extra.length) {
        failures.push(`table keys differ from the generator list (missing: ${missing.join(', ') || 'none'}, extra: ${extra.join(', ') || 'none'})`);
    }

    for (const key of keys) {
        if (!Object.hasOwn(DATE_DATA, key)) {
            continue;
        }
        const formatters = {};
        for (const [name, options] of Object.entries(PATTERN_OPTIONS)) {
            formatters[name] = createFormatter(key, options);
        }
        let reported = 0;
        for (const date of dates()) {
            const actual = formatDateParts(date, DATE_DATA[key], 'UTC');
            for (const name of Object.keys(formatters)) {
                const expected = normalize(formatters[name].format(date));
                compared++;
                if (actual[name] !== expected && reported++ < 3) {
                    failures.push(`${key} ${name} ${date.toISOString()}: table "${actual[name]}", ICU "${expected}"`);
                }
            }
        }
    }

    const versions = `ICU ${process.versions.icu}, CLDR ${process.versions.cldr}`;
    if (failures.length) {
        console.error(failures.join('\n'));
        console.error(`\n${failures.length} difference(s) against ${versions}.`);
        if (!sameVersion) {
            console.error(
                `The table was generated with ICU ${DATE_DATA_SOURCE.icu}, CLDR ${DATE_DATA_SOURCE.cldr}: the data itself may have changed. ` +
                    'Regenerate it on purpose (npm run generate:dates) and review the diff.'
            );
        }
        process.exit(1);
    }
    console.log(
        `${keys.length} entries, ${compared} formatted values match ${versions}${sameVersion ? '' : ' (the table was generated with another version)'}`
    );
}

check();
