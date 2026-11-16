# email-text-tools

Email text tools

Ships ES module and CommonJS builds with type declarations, Node.js 22.22.2, 24.15.0 or newer:

```js
import { mimeHtml, textToHtml } from '@postalsys/email-text-tools';
// or
const { mimeHtml, textToHtml } = require('@postalsys/email-text-tools');
```

`require()` loads `mimeHtml` (and with it jsdom) only on first access; an ES module import loads it up front.

`INLINE_STYLE_BLOCK` is the `<style>` block `mimeHtml()` prepends to a message that only has a text body (font and the colours of nested quotes), for a caller that converts text with `textToHtml()` itself and wants the same styling. Reading it does not load jsdom.

## mimeHtml sanitizer policy

`mimeHtml()` sanitizes with DOMPurify and additionally removes:

- elements: `title`, `link`, `meta`, `base`, `basefont`, `frame`, `iframe`, `frameset`, `template`, `script`, `noframes`, `noscript`, `object`, `embed`, `dialog`, `canvas`, `audio`, `video`, `applet`, and forms with their controls (`form`, `input`, `button`, `select`, `textarea`; their text content is kept)
- attributes: `action`, `formaction`, `popover`, `popovertarget`
- CSS rules whose selector uses `:is()`, `:where()`, `:has()` or a `:not()` containing another pseudo-class, and any `<style>` text beyond 256 KB per message
- CSS inlining altogether when the style text holds more than 5,000 selectors, the document more than 50,000 elements, or the product of the two exceeds 5,000,000 (inlining costs one selector match per element). The sanitized HTML is then returned with its `<style>` rules dropped and `data-css-inlining="skipped"` on the wrapper `<div>`
- a `style` attribute that still names a forbidden property after the CSSOM has filtered it, which means the CSSOM could not parse that declaration: the attribute is reduced to the declarations it did parse, or removed
- SVG and MathML (DOMPurify runs with the `html` profile only): the namespace confusion between the three is where most sanitizer bypasses have come from, and mail has no use for either
- `width`, `min-width`, `max-width`, `height`, `min-height` and `max-height` from the body's own style, which would otherwise size the container the host gave the message

The output is two wrappers: an outer `<div style="overflow: auto; contain: paint;">` that is never given anything else, and inside it a `<div>` carrying the sanitized styles of the message body. Everything the body does (its margins, a `display: contents`, a box-shadow) is clipped by the outer element. `position` is forbidden on every element because it is the one property that escapes an overflow clip, and the paint containment makes the outer element the containing block of a fixed or absolute descendant in case one slips through. Every `a` and `area` gets `target="_blank" rel="noopener noreferrer"`, whatever `rel` it came with.

Markup without a `<style>` start tag is sanitized once; the first pass exists to find and filter the stylesheets before they are inlined.

Input nested more than about 1000 elements deep, or that the parser cannot process, is rendered as escaped plain text instead of throwing. `inlineHtml()` applies the same depth limit to the quoted message and to the new content, and quotes escaped text instead when it is exceeded.

## Reply and forward headers

`inlineHtml()` and `inlineText()` quote a message under new content, the way a mail client does when replying or forwarding. The lines they add (the "On ... wrote:" line of a reply, the header block of a forward) are written in the language of the `locale` option:

```js
inlineText('reply', 'Tack!', message, { locale: 'sv', tz: 'Europe/Stockholm' });
// Tack!
//
// > Den mån 16 nov. 2026 kl. 10:45 skrev Jane Doe <jane@example.com>:
// > ...
```

The action is `reply`, `reply-all` (the same as `reply`) or `forward`. `tz` is an IANA time zone and defaults to the time zone of the host; an unknown one is read as UTC.

**Languages.** There is one entry per language, picked by the language part of the tag, so `sv-SE` and `sv_FI` are both `sv`; a region, a script and Unicode extensions (calendar, numbering system, hour cycle) are otherwise ignored. Two languages have a second entry: `en-GB` (the same words, day-first dates on a 24-hour clock) and Traditional Chinese (`zh-Hant`, also chosen for `zh-TW`, `zh-HK` and `zh-MO`; an explicit script wins over the region). `no` is read as `nb`. The 55 entries:

`af` `ar` `az` `be` `bg` `bs` `ca` `cs` `cy` `da` `de` `el` `en` `en-GB` `eo` `es` `et` `eu` `fi` `fr` `fy` `ga` `gl` `he` `hr` `hu` `hy` `id` `is` `it` `ja` `ka` `kk` `ko` `lt` `lv` `mk` `ms` `nb` `nl` `nn` `pl` `pt` `ro` `ru` `sk` `sl` `sq` `sr` `sv` `tr` `uk` `vi` `zh` `zh-Hant`

Any other locale, a malformed one included, is written in English. That covers the official languages of the EU except Maltese, which is left out until a native speaker has reviewed it, and it leaves out Persian and Thai, whose dates belong to calendars of their own. Portuguese uses European wording, Serbian is Cyrillic. The translations were written for this library and compared against the wording of other mail clients, not reviewed by native speakers one by one: corrections are welcome, the table is `src/lib/inline-locales.ts`.

**Dates.** A date is written the way the language writes it (`mån 16 nov. 2026`, `2026年11月16日(月)`), always in the Gregorian calendar with Latin digits. The patterns come from a table generated from Unicode CLDR data and shipped with the package (`UNICODE-LICENSE.txt` carries its license), not from the `Intl` of the running Node.js, so the output is the same on a Node.js build without full ICU data, such as a single-file binary built with `@yao-pkg/pkg`, where `Intl` only knows English. `lib/format-date` formats a date the same way on its own.

A message without a date, or with one that can not be read as a date, gets a reply line without it (`Jane Doe wrote:`); a forward keeps the text of an unreadable date in its Date header.

**Right-to-left.** Arabic and Hebrew headers are marked `dir="rtl"` in HTML, and the names, addresses and dates put into them are isolated (`<bdi>` in HTML, the Unicode isolate characters U+2068 and U+2069 in plain text) so that a Latin name does not reorder the sentence around it. The quoted message itself is left as it is.

**Changed in 3.1.** Until 3.0 the words were always English and only the date followed the locale, and only where the Node.js build had the ICU data for it. A caller that already passes a `locale` therefore gets translated headers after upgrading. A regional tag no longer changes the date format (`de-CH` and `en-AU` are formatted like `de` and `en`; `en-GB` keeps its own), and a locale without an entry gets an English date where a full-ICU Node.js used to format it in that language. Default and `en` output is unchanged.
