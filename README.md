# email-text-tools

Email text tools

## mimeHtml sanitizer policy

`mimeHtml()` sanitizes with DOMPurify and additionally removes:

- elements: `title`, `link`, `meta`, `base`, `basefont`, `frame`, `iframe`, `frameset`, `template`, `script`, `noframes`, `noscript`, `object`, `embed`, `dialog`, `canvas`, `audio`, `video`, `applet`, and forms with their controls (`form`, `input`, `button`, `select`, `textarea`; their text content is kept)
- attributes: `action`, `formaction`, `popover`, `popovertarget`
- CSS rules whose selector uses `:is()`, `:where()`, `:has()` or a `:not()` containing another pseudo-class, and any `<style>` text beyond 256 KB per message

Input nested more than about 1000 elements deep, or that the parser cannot process, is rendered as escaped plain text instead of throwing.

Reply/forward date headers from `inlineHtml()` and `inlineText()` are formatted with `Intl.DateTimeFormat` (for example `Sat, Jun 15, 2024, 2:30 PM`). An unsupported locale falls back to English and an unknown time zone to UTC. A Node build without full ICU data only has English.
