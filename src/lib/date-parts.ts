import type { DatePatterns } from './date-data.js';

/** A date formatted three ways for the headers of a quoted message */
export interface DateParts {
    /** For example "Sat, Jun 15, 2024" */
    date: string;
    /** For example "2:30 PM" */
    time: string;
    /** For example "Sat, Jun 15, 2024, 2:30 PM" */
    dateTime: string;
}

interface DateFields {
    weekday: number;
    year: string;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Only the numbers of the date are taken from Intl, in English: that part works in every Node.js
// build, including the ones that carry no ICU data for other languages, and it is what applies
// the time zone
const FIELD_OPTIONS: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
};

function createFieldFormatter(tz: string | undefined): Intl.DateTimeFormat {
    try {
        return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', Object.assign({ timeZone: tz || undefined }, FIELD_OPTIONS));
    } catch (err) {
        if (!(err instanceof RangeError)) {
            throw err;
        }
        // an unknown time zone falls back to UTC rather than to whatever zone the host runs in
        return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', Object.assign({ timeZone: 'UTC' }, FIELD_OPTIONS));
    }
}

function readFields(date: Date, tz: string | undefined): DateFields {
    const values: Record<string, string> = {};
    for (const part of createFieldFormatter(tz).formatToParts(date)) {
        values[part.type] = part.value;
    }
    return {
        weekday: Math.max(WEEKDAYS.indexOf(values.weekday || ''), 0),
        year: values.year || '',
        month: Number(values.month) - 1,
        day: Number(values.day),
        // h23 is what was asked for, the remainder covers an engine that prints midnight as 24
        hour: Number(values.hour) % 24,
        minute: Number(values.minute)
    };
}

function hourOf(hour: number, hourCycle: DatePatterns['hourCycle']): number {
    switch (hourCycle) {
        case 'h12':
            return hour % 12 || 12;
        case 'h11':
            return hour % 12;
        case 'h24':
            return hour || 24;
        default:
            return hour;
    }
}

function fill(pattern: string, patterns: DatePatterns, fields: DateFields): string {
    return pattern.replace(/\{([a-zA-Z]+)\}/g, (_match, field: string) => {
        const width = field.length;
        switch (field.charAt(0)) {
            case 'w':
                return patterns.weekdays[fields.weekday] || '';
            case 'y':
                return fields.year;
            case 'M':
                return patterns.months[fields.month] || '';
            case 'd':
                return String(fields.day).padStart(width, '0');
            case 'h':
                return String(hourOf(fields.hour, patterns.hourCycle)).padStart(width, '0');
            case 'm':
                return String(fields.minute).padStart(width, '0');
            case 'a':
                return (patterns.dayPeriods && patterns.dayPeriods[fields.hour < 12 ? 0 : 1]) || '';
            default:
                return '';
        }
    });
}

/**
 * Turns the date of a message into a Date.
 *
 * @returns The date, or null for a value that is not a valid date
 */
export function toValidDate(value: unknown): Date | null {
    const date = value instanceof Date ? value : new Date(value as string | number);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a date with the patterns of a locale entry.
 *
 * @param date A valid date
 * @param patterns Patterns of the locale entry, see resolveInlineLocale()
 * @param tz IANA time zone, defaults to the local time zone, an unknown one is read as UTC
 */
export function formatDateParts(date: Date, patterns: DatePatterns, tz?: string): DateParts {
    const fields = readFields(date, tz);
    return {
        date: fill(patterns.date, patterns, fields),
        time: fill(patterns.time, patterns, fields),
        dateTime: fill(patterns.dateTime, patterns, fields)
    };
}
