import { formatDateParts, toValidDate } from './date-parts.js';
import { resolveInlineLocale } from './inline-locales.js';

export interface FormatDateOptions {
    /**
     * BCP 47 language tag, defaults to 'en'. Only the language counts (plus `en-GB` and
     * Traditional Chinese), see resolveInlineLocale(); an unsupported one is formatted as 'en'.
     */
    locale?: string | undefined;
    /** IANA time zone, defaults to the local time zone */
    tz?: string | undefined;
}

/**
 * Formats the date of a quoted message for the reply/forward header, for example
 * "Sat, Jun 15, 2024, 2:30 PM" in English.
 *
 * The patterns come from a table generated from CLDR data (date-data.ts) and not from the Intl
 * of the running Node.js, so the result does not depend on which ICU data that build carries:
 * the single-file binaries EmailEngine ships as only have English.
 *
 * @param value Date to format
 * @param options Locale and time zone
 * @returns Formatted date, or the input as text when it is not a valid date
 */
export default function formatDate(value: Date | string | number, options?: FormatDateOptions | null): string {
    options = options || {};
    const date = toValidDate(value);
    if (!date) {
        return String(value);
    }
    return formatDateParts(date, resolveInlineLocale(options.locale).dates, options.tz).dateTime;
}
