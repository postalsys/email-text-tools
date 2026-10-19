# email-text-tools

Email text tools

Ships ES module and CommonJS builds with type declarations, Node.js 20 or newer:

```js
import { mimeHtml, textToHtml } from '@postalsys/email-text-tools';
// or
const { mimeHtml, textToHtml } = require('@postalsys/email-text-tools');
```

`require()` loads `mimeHtml` (and with it jsdom) only on first access; an ES module import loads it up front.

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

Reply/forward date headers from `inlineHtml()` and `inlineText()` are formatted with `Intl.DateTimeFormat` (for example `Sat, Jun 15, 2024, 2:30 PM`). An unsupported locale falls back to English and an unknown time zone to UTC. A Node build without full ICU data only has English.
