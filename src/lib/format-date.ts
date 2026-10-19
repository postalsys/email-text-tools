const DATE_FORMAT: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
};

// An unsupported locale would silently fall back to the host's default locale, and a Node build
// with only English ICU data (pkg binaries use small-icu) renders other locales as broken
// placeholders such as "M09 28, Mon", so anything not actually supported becomes 'en'.
function resolveLocale(locale: string | undefined): string {
    if (locale) {
        try {
            const supported = Intl.DateTimeFormat.supportedLocalesOf([locale]);
            if (supported.length) {
                return supported[0];
            }
        } catch (_err) {
            // structurally invalid language tag
        }
    }
    return 'en';
}

export interface FormatDateOptions {
    /** BCP 47 language tag, defaults to 'en' */
    locale?: string | undefined;
    /** IANA time zone, defaults to the local time zone */
    tz?: string | undefined;
}

/**
 * Formats the date of a quoted message for the reply/forward header, for example
 * "Sat, Jun 15, 2024, 2:30 PM" in English.
 *
 * @param value Date to format
 * @param options Locale and time zone
 * @returns Formatted date, or the input as text when it is not a valid date
 */
export default function formatDate(value: Date | string | number, options?: FormatDateOptions | null): string {
    options = options || {};
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
        return String(value);
    }

    const locale = resolveLocale(options.locale);
    let formatter: Intl.DateTimeFormat;
    try {
        formatter = new Intl.DateTimeFormat(locale, Object.assign({ timeZone: options.tz || undefined }, DATE_FORMAT));
    } catch (err) {
        if (!(err instanceof RangeError)) {
            throw err;
        }
        // an unknown time zone falls back to UTC rather than to whatever zone the host runs in
        formatter = new Intl.DateTimeFormat(locale, Object.assign({ timeZone: 'UTC' }, DATE_FORMAT));
    }
    const formatted = formatter.format(date);

    // ICU puts a narrow no-break space before "PM", which older mail clients show as a box
    return formatted.replace(/[\u00a0\u202f]/g, ' ');
}
