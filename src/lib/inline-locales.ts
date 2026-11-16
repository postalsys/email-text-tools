// The languages the reply and forward headers of inlineText() and inlineHtml() are written in.
//
// One entry per language, picked by the language part of the requested locale, so `sv-SE` and
// `sv_FI` are both `sv`. Two languages have a second entry, because the difference is more than
// a regional preference: `en-GB` (day-first dates on a 24-hour clock, the words are the same)
// and `zh-Hant` (Traditional Chinese is a different script). Anything else falls back to `en`.
//
// Every entry is joined with its date patterns from DATE_DATA (date-data.ts, generated), and
// the module does not load when one is missing.
//
// This file and its test fixtures are the exception to the printable-ASCII rule of the
// repository: a translation has to be readable to be reviewed. Invisible characters are still
// written as escapes.
//
// Provenance. The translations were written for this library and then compared, for meaning and
// word order, against the reply headers of other mail clients as of 2026-11-16: Thunderbird
// (thunderbird-l10n, composeMsgs.properties), Roundcube (program/localization), K-9 Mail /
// Thunderbird for Android (strings.xml), GNOME Evolution (po) and Bulwark (locales). None of
// them was copied; for many languages there is only one natural way to say "X wrote:". No entry
// has had a review by a native speaker commissioned for it, so corrections are welcome.
//
// Left out on purpose, falling back to English:
// - Maltese (mt): an official EU language, but no mail client has the phrase to compare
//   against. To be added once a native speaker has reviewed it.
// - Persian (fa) and Thai (th): both write dates in a calendar of their own, which the
//   Gregorian date table can not provide.
// - Asturian, Breton, Kaqchikel, Lower and Upper Sorbian, Scottish Gaelic, Interlingua, Kabyle,
//   Romansh, Western Armenian, Khmer, Uzbek and Punjabi, which Thunderbird ships but could not
//   be translated here with enough confidence.

import { DATE_DATA } from './date-data.js';
import type { DatePatterns } from './date-data.js';

/** The words of the reply and forward headers in one language */
export interface InlineStrings {
    /** Reply line of a message with a date. Placeholders: {date}, {time}, {author} */
    replyDated: string;
    /** Reply line of a message without a usable date. Placeholder: {author} */
    replyUndated: string;
    /** The line that opens the headers of a forwarded message */
    forward: string;
    from: string;
    subject: string;
    date: string;
    to: string;
    cc: string;
    bcc: string;
    /** What stands between a header label and its value */
    separator: string;
}

export interface InlineLocale {
    /** Key of the entry */
    key: string;
    dir: 'ltr' | 'rtl';
    strings: InlineStrings;
    /** How the language writes a date, from the generated table */
    dates: DatePatterns;
}

type Row = [
    replyDated: string,
    replyUndated: string,
    forward: string,
    from: string,
    subject: string,
    date: string,
    to: string,
    cc: string,
    bcc: string,
    separator?: string
];

const ENGLISH: Row = ['On {date}, {time}, {author} wrote:', '{author} wrote:', 'Begin forwarded message:', 'From', 'Subject', 'Date', 'To', 'Cc', 'Bcc'];

// prettier-ignore
const ROWS: Record<string, Row> = {
    af: ['Op {date} om {time} het {author} geskryf:', '{author} het geskryf:', 'Aangestuurde boodskap:', 'Van', 'Onderwerp', 'Datum', 'Aan', 'Cc', 'Bcc'],
    ar: ['في {date}، {time}، كتب {author}:', 'كتب {author}:', 'رسالة معاد توجيهها:', 'من', 'الموضوع', 'التاريخ', 'إلى', 'نسخة', 'نسخة مخفية'],
    az: ['{date}, saat {time}, {author} yazıb:', '{author} yazıb:', 'Yönləndirilmiş məktub:', 'Kimdən', 'Mövzu', 'Tarix', 'Kimə', 'Nüsxə', 'Gizli nüsxə'],
    be: ['{date} у {time} {author} піша:', '{author} піша:', 'Перасланае паведамленне:', 'Ад', 'Тэма', 'Дата', 'Каму', 'Копія', 'Схаваная копія'],
    bg: ['На {date} в {time} {author} написа:', '{author} написа:', 'Препратено съобщение:', 'От', 'Тема', 'Дата', 'До', 'Копие', 'Скрито копие'],
    bs: ['{date} u {time} {author} je napisao/la:', '{author} je napisao/la:', 'Proslijeđena poruka:', 'Od', 'Predmet', 'Datum', 'Za', 'Kopija', 'Skrivena kopija'],
    ca: ['El {date} a les {time}, {author} va escriure:', '{author} va escriure:', 'Missatge reenviat:', 'De', 'Assumpte', 'Data', 'Per a', 'Cc', 'Cco'],
    cs: ['{date} v {time} {author} napsal(a):', '{author} napsal(a):', 'Přeposlaná zpráva:', 'Od', 'Předmět', 'Datum', 'Komu', 'Kopie', 'Skrytá kopie'],
    cy: ['Ar {date} am {time}, ysgrifennodd {author}:', 'Ysgrifennodd {author}:', 'Neges a anfonwyd ymlaen:', 'Oddi wrth', 'Pwnc', 'Dyddiad', 'At', 'Cc', 'Bcc'],
    da: ['Den {date} kl. {time} skrev {author}:', '{author} skrev:', 'Videresendt meddelelse:', 'Fra', 'Emne', 'Dato', 'Til', 'Cc', 'Bcc'],
    de: ['Am {date} um {time} schrieb {author}:', '{author} schrieb:', 'Weitergeleitete Nachricht:', 'Von', 'Betreff', 'Datum', 'An', 'Cc', 'Bcc'],
    el: ['Στις {date}, {time}, ο/η {author} έγραψε:', 'Ο/Η {author} έγραψε:', 'Προωθημένο μήνυμα:', 'Από', 'Θέμα', 'Ημερομηνία', 'Προς', 'Κοιν.', 'Κρυφή κοιν.'],
    en: ENGLISH,
    'en-GB': ENGLISH,
    eo: ['Je {date} je {time}, {author} skribis:', '{author} skribis:', 'Plusendita mesaĝo:', 'De', 'Temo', 'Dato', 'Al', 'Kopio', 'Kaŝita kopio'],
    es: ['El {date} a las {time}, {author} escribió:', '{author} escribió:', 'Mensaje reenviado:', 'De', 'Asunto', 'Fecha', 'Para', 'Cc', 'Cco'],
    et: ['{date} kell {time} kirjutas {author}:', '{author} kirjutas:', 'Edastatud kiri:', 'Saatja', 'Teema', 'Kuupäev', 'Saaja', 'Koopia', 'Pimekoopia'],
    eu: ['{author} erabiltzaileak hau idatzi zuen ({date}, {time}):', '{author} erabiltzaileak hau idatzi zuen:', 'Birbidalitako mezua:', 'Nork', 'Gaia', 'Data', 'Nori', 'Cc', 'Bcc'],
    fi: ['{author} kirjoitti {date} klo {time}:', '{author} kirjoitti:', 'Välitetty viesti:', 'Lähettäjä', 'Aihe', 'Päiväys', 'Vastaanottaja', 'Kopio', 'Piilokopio'],
    fr: ['Le {date} à {time}, {author} a écrit :', '{author} a écrit :', 'Message transféré :', 'De', 'Objet', 'Date', 'À', 'Cc', 'Cci', ' : '],
    fy: ['Op {date} om {time} skreau {author}:', '{author} skreau:', 'Trochstjoerd berjocht:', 'Fan', 'Underwerp', 'Datum', 'Oan', 'Cc', 'Bcc'],
    ga: ['Ar {date} ag {time}, scríobh {author}:', 'Scríobh {author}:', 'Teachtaireacht curtha ar aghaidh:', 'Ó', 'Ábhar', 'Dáta', 'Chuig', 'Cc', 'Bcc'],
    gl: ['O {date} ás {time}, {author} escribiu:', '{author} escribiu:', 'Mensaxe reenviada:', 'De', 'Asunto', 'Data', 'Para', 'Cc', 'Cco'],
    he: ['בתאריך {date} בשעה {time}, {author} כתב/ה:', '{author} כתב/ה:', 'הודעה שהועברה:', 'מאת', 'נושא', 'תאריך', 'אל', 'עותק', 'עותק מוסתר'],
    hr: ['{date} u {time} {author} je napisao/la:', '{author} je napisao/la:', 'Proslijeđena poruka:', 'Od', 'Predmet', 'Datum', 'Za', 'Kopija', 'Skrivena kopija'],
    hu: ['{date} {time} időpontban {author} ezt írta:', '{author} ezt írta:', 'Továbbított üzenet:', 'Feladó', 'Tárgy', 'Dátum', 'Címzett', 'Másolat', 'Titkos másolat'],
    hy: ['{date}, ժամը {time}-ին {author} գրել է:', '{author} գրել է:', 'Փոխանցված նամակ:', 'Ումից', 'Թեմա', 'Ամսաթիվ', 'Ում', 'Պատճեն', 'Թաքուն պատճեն'],
    id: ['Pada {date} pukul {time}, {author} menulis:', '{author} menulis:', 'Pesan yang diteruskan:', 'Dari', 'Subjek', 'Tanggal', 'Kepada', 'Cc', 'Bcc'],
    is: ['Þann {date} kl. {time} skrifaði {author}:', '{author} skrifaði:', 'Áframsend skilaboð:', 'Frá', 'Efni', 'Dagsetning', 'Til', 'Afrit', 'Falið afrit'],
    it: ['Il giorno {date} alle {time}, {author} ha scritto:', '{author} ha scritto:', 'Messaggio inoltrato:', 'Da', 'Oggetto', 'Data', 'A', 'Cc', 'Ccn'],
    ja: ['{date} {time} に {author} さんは書きました:', '{author} さんは書きました:', '転送されたメッセージ:', '差出人', '件名', '日付', '宛先', 'Cc', 'Bcc'],
    ka: ['{date}, {time}, {author} წერს:', '{author} წერს:', 'გადაგზავნილი წერილი:', 'ვისგან', 'თემა', 'თარიღი', 'ვის', 'ასლი', 'ფარული ასლი'],
    kk: ['{date}, сағат {time}, {author} жазды:', '{author} жазды:', 'Қайта жіберілген хабарлама:', 'Кімнен', 'Тақырыбы', 'Күні', 'Кімге', 'Көшірме', 'Жасырын көшірме'],
    ko: ['{date} {time}에 {author} 님이 작성:', '{author} 님이 작성:', '전달된 메시지:', '보낸 사람', '제목', '날짜', '받는 사람', '참조', '숨은 참조'],
    lt: ['{date} {time}, {author} rašė:', '{author} rašė:', 'Persiųstas laiškas:', 'Nuo', 'Tema', 'Data', 'Kam', 'Kopija', 'Nematoma kopija'],
    lv: ['{date} plkst. {time} {author} rakstīja:', '{author} rakstīja:', 'Pārsūtītā vēstule:', 'No', 'Temats', 'Datums', 'Kam', 'Kopija', 'Diskrētā kopija'],
    mk: ['На {date} во {time}, {author} напиша:', '{author} напиша:', 'Препратена порака:', 'Од', 'Тема', 'Датум', 'До', 'Копија', 'Скриена копија'],
    ms: ['Pada {date} pukul {time}, {author} menulis:', '{author} menulis:', 'Mesej yang dimajukan:', 'Daripada', 'Subjek', 'Tarikh', 'Kepada', 'Cc', 'Bcc'],
    nb: ['Den {date} kl. {time} skrev {author}:', '{author} skrev:', 'Videresendt melding:', 'Fra', 'Emne', 'Dato', 'Til', 'Kopi', 'Blindkopi'],
    nl: ['Op {date} om {time} schreef {author}:', '{author} schreef:', 'Doorgestuurd bericht:', 'Van', 'Onderwerp', 'Datum', 'Aan', 'Cc', 'Bcc'],
    nn: ['Den {date} kl. {time} skreiv {author}:', '{author} skreiv:', 'Vidaresend melding:', 'Frå', 'Emne', 'Dato', 'Til', 'Kopi', 'Blindkopi'],
    pl: ['{date} o {time} {author} napisał(a):', '{author} napisał(a):', 'Przekazana wiadomość:', 'Od', 'Temat', 'Data', 'Do', 'DW', 'UDW'],
    pt: ['A {date}, às {time}, {author} escreveu:', '{author} escreveu:', 'Mensagem reencaminhada:', 'De', 'Assunto', 'Data', 'Para', 'Cc', 'Bcc'],
    ro: ['În {date}, la {time}, {author} a scris:', '{author} a scris:', 'Mesaj redirecționat:', 'De la', 'Subiect', 'Dată', 'Către', 'Cc', 'Bcc'],
    ru: ['{date} в {time} {author} пишет:', '{author} пишет:', 'Пересылаемое сообщение:', 'От', 'Тема', 'Дата', 'Кому', 'Копия', 'Скрытая копия'],
    sk: ['{date} o {time} {author} napísal(a):', '{author} napísal(a):', 'Preposlaná správa:', 'Od', 'Predmet', 'Dátum', 'Komu', 'Kópia', 'Skrytá kópia'],
    sl: ['V {date} ob {time} je {author} napisal(a):', '{author} je napisal(a):', 'Posredovano sporočilo:', 'Od', 'Zadeva', 'Datum', 'Za', 'Kp', 'Skp'],
    sq: ['Më {date}, në orën {time}, {author} shkroi:', '{author} shkroi:', 'Mesazh i përcjellë:', 'Nga', 'Subjekti', 'Data', 'Për', 'Cc', 'Bcc'],
    sr: ['{date} у {time} {author} је написао/ла:', '{author} је написао/ла:', 'Прослеђена порука:', 'Од', 'Тема', 'Датум', 'За', 'Копија', 'Скривена копија'],
    sv: ['Den {date} kl. {time} skrev {author}:', '{author} skrev:', 'Vidarebefordrat meddelande:', 'Från', 'Ämne', 'Datum', 'Till', 'Kopia', 'Hemlig kopia'],
    tr: ['{date} {time} tarihinde {author} şunu yazdı:', '{author} şunu yazdı:', 'İletilen ileti:', 'Kimden', 'Konu', 'Tarih', 'Kime', 'Bilgi', 'Gizli'],
    uk: ['{date} о {time} {author} пише:', '{author} пише:', 'Переслане повідомлення:', 'Від', 'Тема', 'Дата', 'Кому', 'Копія', 'Прихована копія'],
    vi: ['Vào {date} lúc {time}, {author} đã viết:', '{author} đã viết:', 'Thư đã chuyển tiếp:', 'Từ', 'Chủ đề', 'Ngày', 'Đến', 'Cc', 'Bcc'],
    zh: ['{author} 于 {date} {time} 写道：', '{author} 写道：', '转发的邮件：', '发件人', '主题', '日期', '收件人', '抄送', '密送', '：'],
    'zh-Hant': ['{author} 於 {date} {time} 寫道：', '{author} 寫道：', '轉寄的郵件：', '寄件者', '主旨', '日期', '收件者', '副本', '密件副本', '：']
};

const RTL = new Set(['ar', 'he']);

// Language codes that were renamed, and Norwegian, which callers ask for by its macrolanguage
const ALIASES = new Map([
    ['no', 'nb'],
    ['iw', 'he'],
    ['in', 'id']
]);

const TRADITIONAL_CHINESE_REGIONS = new Set(['tw', 'hk', 'mo']);

function toLocale(key: string, row: Row): InlineLocale {
    const [replyDated, replyUndated, forward, from, subject, date, to, cc, bcc, separator] = row;
    // An entry without date patterns would write its words around an English date. That is a
    // table nobody regenerated (npm run generate:dates), so it stops here and not in a sent mail.
    if (!Object.hasOwn(DATE_DATA, key)) {
        throw new Error(`No date patterns for the "${key}" entry, regenerate src/lib/date-data.ts`);
    }
    return {
        key,
        dir: RTL.has(key) ? 'rtl' : 'ltr',
        strings: { replyDated, replyUndated, forward, from, subject, date, to, cc, bcc, separator: separator || ': ' },
        dates: DATE_DATA[key]
    };
}

// A Map, not an object: the locale comes from the caller, and "constructor" or "__proto__" has
// to be an unknown language, not a property of the table
const LOCALES = new Map<string, InlineLocale>(Object.entries(ROWS).map(([key, row]) => [key, toLocale(key, row)]));

const DEFAULT_LOCALE = LOCALES.get('en') as InlineLocale;

/** Keys of the shipped entries, in alphabetical order */
export const INLINE_LOCALE_KEYS: string[] = Array.from(LOCALES.keys());

function resolveKey(locale: unknown): string {
    if (typeof locale !== 'string' || locale.length > 64) {
        return 'en';
    }

    const subtags = locale.trim().toLowerCase().split(/[-_]/);
    if (!subtags.every(subtag => /^[a-z0-9]{1,8}$/.test(subtag))) {
        return 'en';
    }

    const language = ALIASES.get(subtags[0]) || subtags[0];

    let script = '';
    let region = '';
    for (const subtag of subtags.slice(1)) {
        if (subtag.length === 1) {
            // an extension such as -u-ca-buddhist, nothing after it names a script or a region
            break;
        }
        if (!script && !region && /^[a-z]{4}$/.test(subtag)) {
            script = subtag;
        } else if (!region && /^([a-z]{2}|[0-9]{3})$/.test(subtag)) {
            region = subtag;
        }
    }

    if (language === 'zh') {
        // an explicit script decides, a region only hints at one
        if (script === 'hant' || (script !== 'hans' && TRADITIONAL_CHINESE_REGIONS.has(region))) {
            return 'zh-Hant';
        }
        return 'zh';
    }

    if (language === 'en' && region === 'gb') {
        return 'en-GB';
    }

    return language;
}

/**
 * Finds the entry the headers of a reply or a forward are written with.
 *
 * Only the language of the tag counts (with the two exceptions named at the top of this file):
 * a region, a script other than the Chinese ones, and Unicode extensions such as a calendar or
 * a numbering system are ignored. An unknown, unsupported or malformed locale is English.
 *
 * @param locale BCP 47 language tag, underscores are accepted in place of hyphens
 */
export function resolveInlineLocale(locale?: unknown): InlineLocale {
    return LOCALES.get(resolveKey(locale)) || DEFAULT_LOCALE;
}

/**
 * Fills the placeholders of a header template.
 *
 * The template is split once and the values are put in place as they are, so a value that
 * itself contains "{date}" or a replacement pattern like "$&" stays what it is.
 *
 * @param template Text with {name} placeholders
 * @param values Value of each placeholder, already escaped for the output format
 * @param escapeLiteral Escapes the text of the template itself
 */
export function fillTemplate(template: string, values: Record<string, string>, escapeLiteral: (text: string) => string): string {
    return template
        .split(/(\{[a-z]+\})/)
        .map((part, index) => {
            if (index % 2 === 0) {
                return part ? escapeLiteral(part) : '';
            }
            const name = part.slice(1, -1);
            if (!Object.hasOwn(values, name)) {
                throw new Error(`Unknown placeholder ${part}`);
            }
            return values[name];
        })
        .join('');
}
