// The ES module entry point and the source of the type declarations of both builds. The
// CommonJS entry point is index.cts: it has the same exports but loads mimeHtml, and with it
// jsdom, only on first access. An ES module can not defer a synchronous import, so here
// mimeHtml is loaded with the rest.

import textToHtml from './lib/text-to-html.js';
import htmlToText from './lib/html-to-text.js';
import inlineHtml from './lib/inline-html.js';
import inlineText from './lib/inline-text.js';
import mimeHtml from './lib/mime-html.js';
import { INLINE_STYLE_BLOCK } from './lib/inline-style.js';

export type { FormatDateOptions } from './lib/format-date.js';
export type { InlineAction, MessageAddress, QuotedMessage } from './lib/inline-html.js';
export type { MimeHtmlAsyncOptions, MimeHtmlMessage } from './lib/mime-html.js';
export type { WorkerPoolOptions, WorkerPoolStats } from './lib/worker-pool.js';

export { textToHtml, htmlToText, inlineHtml, inlineText, mimeHtml, INLINE_STYLE_BLOCK };

const textTools = { textToHtml, htmlToText, inlineHtml, inlineText, mimeHtml, INLINE_STYLE_BLOCK };

export default textTools;
