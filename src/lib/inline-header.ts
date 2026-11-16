import { formatDateParts, toValidDate } from './date-parts.js';
import type { DateParts } from './date-parts.js';
import type { FormatDateOptions } from './format-date.js';
import type { QuotedMessage } from './inline-html.js';
import { fillTemplate, resolveInlineLocale } from './inline-locales.js';
import type { InlineLocale } from './inline-locales.js';

// What inlineText() and inlineHtml() have in common: which headers a quoted message gets, in
// which language and in which order. What differs is how a value is written, so each of them
// passes a HeaderRenderer and wraps the lines it gets back in its own markup.

/** What is decided the same way for the text and the HTML form of a header */
export interface InlineHeader {
    /** `reply` covers reply-all, null is an action without headers of its own */
    kind: 'reply' | 'forward' | null;
    locale: InlineLocale;
    /** The formatted date, null when the message has none or it can not be read as one */
    date: DateParts | null;
    /** The text of a date that can not be read as one, which a forward still shows */
    rawDate: string | null;
}

/** How one output format writes the values of a header. Every method returns finished output */
export interface HeaderRenderer {
    /** Escapes text: a label, the words of a template, a date */
    escape(text: string): string;
    /** Wraps a finished value put into a right-to-left header, so it can not reorder the line */
    isolate(value: string): string;
    /** The addresses of one header, false when there is none to show */
    addresses(input: QuotedMessage['from']): string | false;
    subject(text: string): string;
}

/** One header of a forwarded message, both parts finished output */
export interface HeaderLine {
    /** The label with its separator, for example "From: " */
    label: string;
    value: string;
}

const RECIPIENT_KEYS = ['to', 'cc', 'bcc'] as const;

function kindOf(action: string): InlineHeader['kind'] {
    switch (action) {
        case 'forward':
            return 'forward';
        case 'reply':
        case 'reply-all':
            return 'reply';
        default:
            return null;
    }
}

function asIs(value: string): string {
    return value;
}

// Only a right-to-left header isolates what is put into it. The others are written exactly as
// they were before the headers were translated.
function wrapperOf(header: InlineHeader, renderer: HeaderRenderer): (value: string) => string {
    return header.locale.dir === 'rtl' ? renderer.isolate : asIs;
}

/**
 * Resolves the language and the date the headers of a quoted message are written with.
 *
 * Three kinds of date are told apart. A missing one (null, undefined, an empty string) has no
 * Date header and an undated reply line. One that can not be read as a date keeps its raw text
 * in a forwarded Date header, as it always did, and also gets the undated reply line instead of
 * "On garbage, ... wrote:". Everything else is formatted, a timestamp of 0 included.
 */
export function describeHeader(action: string, value: QuotedMessage['date'], options: FormatDateOptions): InlineHeader {
    const locale = resolveInlineLocale(options.locale);
    const header: InlineHeader = { kind: kindOf(action), locale, date: null, rawDate: null };

    if (value === null || value === undefined || value === '') {
        return header;
    }

    const date = toValidDate(value);
    if (date) {
        header.date = formatDateParts(date, locale.dates, options.tz);
    } else {
        header.rawDate = String(value);
    }
    return header;
}

/** The line above a quoted reply, for example "On Sat, Jun 15, 2024, 2:30 PM, Jane wrote:" */
export function replyLine(header: InlineHeader, from: QuotedMessage['from'], renderer: HeaderRenderer): string {
    const { strings } = header.locale;
    const wrap = wrapperOf(header, renderer);
    const values: Record<string, string> = { author: wrap(renderer.addresses(from) || renderer.escape('<>')) };

    if (!header.date) {
        return fillTemplate(strings.replyUndated, values, renderer.escape);
    }
    values.date = wrap(renderer.escape(header.date.date));
    values.time = wrap(renderer.escape(header.date.time));
    return fillTemplate(strings.replyDated, values, renderer.escape);
}

/** The headers listed above a forwarded message: From, Subject, Date, then the recipients */
export function forwardLines(header: InlineHeader, message: QuotedMessage, renderer: HeaderRenderer): HeaderLine[] {
    const { strings } = header.locale;
    const wrap = wrapperOf(header, renderer);
    const lines: HeaderLine[] = [];
    const add = (title: string, value: string) => {
        lines.push({ label: renderer.escape(title + strings.separator), value: wrap(value) });
    };

    if (message.from) {
        add(strings.from, renderer.addresses(message.from) || renderer.escape('<>'));
    }

    if (message.subject) {
        add(strings.subject, renderer.subject(message.subject));
    }

    const date = header.date ? header.date.dateTime : header.rawDate;
    if (date !== null) {
        add(strings.date, renderer.escape(date));
    }

    for (const key of RECIPIENT_KEYS) {
        const value = message[key] && renderer.addresses(message[key]);
        if (value) {
            add(strings[key], value);
        }
    }

    return lines;
}
