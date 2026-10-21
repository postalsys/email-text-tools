import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
// Pinned to juice 11.x: juice 12+ is pure ESM (requires Node >=22.12) and breaks pkg builds.
import juice from 'juice';
import he from 'he';
import { Worker } from 'node:worker_threads';
import WorkerPool from './worker-pool.js';
import type { WorkerPoolStats } from './worker-pool.js';
import { MAX_NESTING_DEPTH, exceedsNestingDepth, fallbackText } from './html-guard.js';
import { INLINE_STYLE_BLOCK } from './inline-style.js';
import { JUICE_WORKER_PATH } from './commonjs.cjs';

import textToHtml from './text-to-html.js';

/** The message to render */
export interface MimeHtmlMessage {
    html?: string | Buffer | null | undefined;
    text?: string | Buffer | null | undefined;
}

export interface MimeHtmlAsyncOptions {
    /** How long juice may run in the worker, in milliseconds (default 5000) */
    timeout?: number | undefined;
    /** Run juice in the shared worker pool (default) or in a worker of its own */
    useWorkerPool?: boolean | undefined;
    /** false rethrows a juice failure or a pipeline error instead of falling back */
    fallbackOnError?: boolean | undefined;
    /** Size of the shared worker pool, used when the pool is created */
    minWorkers?: number | undefined;
    maxWorkers?: number | undefined;
    idleTimeout?: number | undefined;
}

const FORBID_TAGS = [
    'title',
    'link',
    'meta',
    'base',
    'basefont',
    'frame',
    'iframe',
    'frameset',
    'template',
    'script',
    'noframes',
    'noscript',
    'object',
    'embed',
    'dialog',
    'canvas',
    'audio',
    'video',
    'applet',
    // forms and their controls have no use in a displayed message and can be styled to phish
    'form',
    'input',
    'button',
    'select',
    'textarea'
];

// form submission targets and popovers, which let sender markup act on or overlay the viewer
const FORBID_ATTR = ['action', 'formaction', 'popover', 'popovertarget'];

const FORBID_STYLES = [
    'all',
    'position',
    'clip',
    'animation',
    'float',
    'clear',
    'animation-delay',
    'animation-direction',
    'animation-duration',
    'animation-fill-mode',
    'animation-iteration-count',
    'animation-name',
    'animation-play-state',
    'animation-timing-function',
    'offset',
    'offset-anchor',
    'offset-distance',
    'offset-path',
    'offset-position',
    'offset-rotate',
    'paint-order',
    'scrollbar-color',
    'scrollbar-gutter',
    'scrollbar-width',
    'zoom'
];

// Properties to remove from style attributes: the list, a cheap test for style text that could
// name one of them, and a test for one of them in declaration position (at the start, or after any
// character that cannot be part of a longer property name, so "background-position" is not one)
interface StyleRule {
    properties: string[];
    hint: RegExp;
    declaration: RegExp;
}

function styleRule(properties: string[], hint: RegExp): StyleRule {
    return { properties, hint, declaration: new RegExp('(?:^|[^a-z0-9-])(?:' + properties.join('|') + ')\\s*:', 'i') };
}

const FORBID_STYLES_RULE = styleRule(FORBID_STYLES, /position|float|clip|zoom|anim|offset|scrollbar|paint|clear|\ball\b/i);

// Resolves CSS escape sequences (\6F, \o) the way a browser does before it matches a property
// name, so that a forbidden property cannot hide behind an escaped character
function decodeCssEscapes(value: string): string {
    return value.replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?|\\(.)/gi, (match: string, hex: string | undefined, chr: string) => {
        if (hex) {
            let code = parseInt(hex, 16);
            return code && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
        }
        return chr;
    });
}

// keep the style at first
const FORBID_TAGS_ALL = ['style'].concat(FORBID_TAGS);

// HTML only. The default profiles admit SVG and MathML too, and the namespace confusion between
// the three is where most sanitizer bypasses have come from: markup one parser closes inside an
// <svg> or <mglyph> and another reads as HTML. Mail has no use for either, the major webmail
// clients strip inline SVG and MathML never reached a mail client, so both go.
const USE_PROFILES = { html: true };

// A start tag the HTML parser reads as a style element: the name followed by whitespace, "/" or
// ">". Any other character inside the name makes it some other element, and a "<style" at the
// very end of the input is dropped by the parser, so markup this does not match has no stylesheet.
const STYLE_TAG = /<style[\s/>]/i;

// The dimensions of the body. In mail they are page-layout leftovers ("width: 100%; height: 100%",
// "min-height: 100vh") that would only pad or scroll the box the message is shown in, and they
// were removed when the body was the outermost element, which consumers may rely on.
const BODY_STYLES_RULE = styleRule(['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height'], /width|height/i);

// One sanitizer for the module. Every sanitize() call passes its full config, so calls do not
// leak settings into each other.
const DOMPurify = createDOMPurify(new JSDOM('').window);

// Global worker pool instance (lazy initialization)
let globalWorkerPool: WorkerPool | null = null;

function getWorkerPool(options: MimeHtmlAsyncOptions = {}): WorkerPool {
    if (!globalWorkerPool) {
        globalWorkerPool = new WorkerPool({
            minWorkers: options.minWorkers || 2,
            maxWorkers: options.maxWorkers || 4,
            workerTimeout: options.timeout || 5000,
            idleTimeout: options.idleTimeout || 30000
        });
    }
    return globalWorkerPool;
}

// define styles for plaintext emails
// Wrapper for juice that runs in a worker thread with timeout protection
async function juiceWithTimeout(html: string, options: MimeHtmlAsyncOptions = {}): Promise<string> {
    const timeout = options.timeout || 5000;
    const usePool = options.useWorkerPool !== false; // Default to true

    if (usePool) {
        try {
            const pool = getWorkerPool(options);
            return await pool.process(html, { timeout });
        } catch (err) {
            // Fall back to single worker if pool fails
            if (options.fallbackOnError === false) {
                throw err;
            }
        }
    }

    // Single worker implementation (fallback or when pool disabled)
    const timeoutMs = timeout;
    return new Promise((resolve, reject) => {
        const worker = new Worker(JUICE_WORKER_PATH);
        let timedOut = false;

        const timeout = setTimeout(() => {
            timedOut = true;
            void worker.terminate();
            reject(new Error('Juice processing timed out - likely due to unsupported CSS selectors'));
        }, timeoutMs);

        worker.on('message', (msg: { success: boolean; result?: string; error?: string }) => {
            clearTimeout(timeout);
            void worker.terminate();
            if (msg.success) {
                resolve(msg.result!);
            } else {
                reject(new Error(msg.error));
            }
        });

        worker.on('error', (err: Error) => {
            clearTimeout(timeout);
            if (!timedOut) {
                reject(err);
            }
        });

        worker.postMessage(html);
    });
}

// Only this much <style> text is kept per message, the rest is dropped. juice and the selector
// filter below scale with it, and no legitimate email needs more.
const MAX_STYLE_TEXT = 256 * 1024;

// juice matches every selector against every element, so its cost is the product of the two
// counts: 1,000 rules on 10,000 paragraphs took 2.7 s and 10,000 on 10,000 took 25 s, on the
// calling thread, and the style text cap alone leaves the body unbounded. Each bound sits well
// above real mail (an Outlook thread of fifty replies is a few hundred selectors on some fifteen
// thousand elements, a heavy newsletter a thousand on a few thousand) and the product bound keeps
// the worst case around a second: 0.25 us per pair measured when every selector matches every
// element, a quarter of that when none does. Past any of them the sanitized HTML is returned
// without inlined CSS, and the wrapper says so.
const MAX_INLINE_SELECTORS = 5000;
const MAX_INLINE_ELEMENTS = 50000;
const MAX_INLINE_WORK = 5000000;

// Selectors juice would match against the document: every selector of every rule at the top level
// of the style text. A rule nested in an at-rule is not inlined (juice keeps media queries as rules),
// so it only costs its parse and is not counted. One linear pass
function countSelectors(css: string): number {
    let count = 0;
    let depth = 0;
    let commas = 0;
    for (let i = 0; i < css.length; i++) {
        const c = css.charAt(i);
        if (c === '{') {
            if (depth === 0) {
                count += commas + 1;
                commas = 0;
            }
            depth++;
        } else if (c === '}') {
            if (depth > 0) {
                depth--;
            }
            commas = 0;
        } else if (c === ';' && depth === 0) {
            commas = 0;
        } else if (c === ',' && depth === 0) {
            commas++;
        }
    }
    return count;
}

// Rendered in place of the sanitized HTML when the pipeline cannot process the input at all, for
// example when a hostile nesting depth overflows the stack of the parser or the serializer.
function fallbackHtml(message: MimeHtmlMessage): string {
    let text = message.text;
    if (!text && message.html) {
        text = fallbackText(message.html.toString());
    }
    return `<div style="overflow: auto;"><div style="white-space: pre-wrap;">${he.encode((text || '').toString(), { useNamedReferences: true })}</div></div>`;
}

// True when a :not( argument contains another colon. Such selectors, like :is(), :where() and
// :has(), can make juice hang. A single pass with a paren counter keeps this linear, the regex
// it replaces backtracked catastrophically on a few hundred bytes of repeated ":not(a:b)".
function hasNotWithPseudo(selector: string): boolean {
    // paren depth just inside the open :not(, 0 when there is none. Any colon inside it is a
    // match, so a nested :not( never needs tracking.
    let notDepth = 0;
    let depth = 0;
    for (let i = 0; i < selector.length; i++) {
        const c = selector.charAt(i);
        if (c === ':') {
            if (notDepth) {
                return true;
            }
            if (selector.slice(i + 1, i + 5).toLowerCase() === 'not(') {
                depth++;
                notDepth = depth;
                i += 4;
            }
        } else if (c === '(') {
            depth++;
        } else if (c === ')') {
            if (depth === notDepth) {
                notDepth = 0;
            }
            if (depth > 0) {
                depth--;
            }
        }
    }
    return false;
}

function isProblematicSelector(selector: string): boolean {
    const lower = selector.toLowerCase();
    return lower.includes(':is(') || lower.includes(':where(') || lower.includes(':has(') || hasNotWithPseudo(selector);
}

// Drops every rule whose selector could make juice hang. The text is split into rules on "}" and
// the selector of each rule is the text between the last two "{" in it, so a rule nested in an
// at-rule is dropped without its enclosing block.
function filterCss(css: string): string {
    if (!/:(is|where|has|not)\(/i.test(css)) {
        return css;
    }
    const pieces = css.split('}');
    const output: string[] = [];
    for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        const isLast = i === pieces.length - 1;
        const ruleStart = isLast ? -1 : piece.lastIndexOf('{');
        const selectorStart = ruleStart < 0 ? 0 : piece.lastIndexOf('{', ruleStart - 1) + 1;
        const drop = ruleStart >= 0 && isProblematicSelector(piece.substring(selectorStart, ruleStart));
        output.push(drop ? piece.substring(0, selectorStart) : isLast ? piece : piece + '}');
    }
    return output.join('');
}

// Sanitizes the whole document and strips the CSS juice is known to choke on. Returns the HTML
// to run juice on and whether any style text is left for juice to inline.
function prepareHtml(message: MimeHtmlMessage): { html: string; hasStyle: boolean; inliningSkipped: boolean } {
    let source = message.html;
    if (!source && message.text) {
        source = textToHtml(message.text) || '';
        if (source) {
            source = INLINE_STYLE_BLOCK + source;
        }
    }

    const html = (source || '').toString().replace(/^"data:[^"]+"/g, '');

    if (exceedsNestingDepth(html, MAX_NESTING_DEPTH)) {
        throw new Error('HTML is nested too deep to process');
    }

    if (!STYLE_TAG.test(html)) {
        // No style element can come out of this markup, so there is nothing to inline. This pass
        // exists to find and filter the stylesheets before juice sees them, and without one it
        // would only add a parse and a serialization to the pass finishHtml() makes anyway.
        return { html, hasStyle: false, inliningSkipped: false };
    }

    // first pass, returns the <html> element of the fixed HTML page
    const root = DOMPurify.sanitize(html, {
        WHOLE_DOCUMENT: true,
        FORCE_BODY: false,
        USE_PROFILES,
        FORBID_TAGS,
        FORBID_ATTR,
        RETURN_DOM: true
    }) as HTMLElement;

    // Remove any style tags from within body content
    const body = root.querySelector('body');
    const bodyStyleTags = body ? body.querySelectorAll('style') : [];
    bodyStyleTags.forEach(tag => tag.remove());

    // Process remaining style tags to remove known problematic selectors
    let styleBudget = MAX_STYLE_TEXT;
    let hasStyle = false;
    let selectors = 0;
    root.querySelectorAll('style').forEach(styleTag => {
        let cssContent = styleTag.textContent || '';
        if (cssContent.length > styleBudget) {
            // cut after the last complete rule, a partial rule would skip the selector filter
            cssContent = styleBudget > 0 ? cssContent.substring(0, cssContent.lastIndexOf('}', styleBudget - 1) + 1) : '';
        }
        styleBudget -= cssContent.length;
        cssContent = filterCss(cssContent);
        styleTag.textContent = cssContent;
        if (cssContent.trim()) {
            hasStyle = true;
            selectors += countSelectors(cssContent);
        }
    });

    let inliningSkipped = false;
    if (hasStyle) {
        const elements = root.getElementsByTagName('*').length;
        if (selectors > MAX_INLINE_SELECTORS || elements > MAX_INLINE_ELEMENTS || selectors * elements > MAX_INLINE_WORK) {
            hasStyle = false;
            inliningSkipped = true;
        }
    }

    return { html: root.outerHTML, hasStyle, inliningSkipped };
}

// Removes the properties of a style rule from an element the way a browser will read them, by the
// CSSOM first and then by the attribute text the CSSOM did not parse.
function removeStyleProperties(node: HTMLElement, rule: StyleRule): void {
    if (!rule.hint.test(node.getAttribute('style') || '')) {
        return;
    }
    for (const property of rule.properties) {
        node.style.removeProperty(property);
    }
    // removeProperty() rewrites the attribute from the CSSOM, which only holds the declarations
    // cssstyle managed to parse. A forbidden property still named in the attribute after that was
    // never parsed and would go out verbatim for the browser to read its own way: cssstyle 5 parses
    // nothing from an attribute whose "background: url()" shorthand is followed by more
    // declarations, a browser reads every one of them. Keep only what the CSSOM parsed, which may
    // be nothing
    const remaining = node.getAttribute('style') || '';
    if (rule.declaration.test(remaining)) {
        const parsed = node.style.cssText;
        if (parsed) {
            node.setAttribute('style', parsed);
        } else {
            node.removeAttribute('style');
        }
    } else if (!remaining.trim()) {
        node.removeAttribute('style');
    }
}

// The sanitization pass that produces the output (the second one when there was a stylesheet to
// inline, the only one otherwise) and the post-processing of its result.
function finishHtml(html: string, inliningSkipped: boolean): string {
    // outputs a BODY DOM element
    const dom = DOMPurify.sanitize(html, {
        RETURN_DOM: true,
        WHOLE_DOCUMENT: false,
        FORCE_BODY: true,
        USE_PROFILES,
        FORBID_TAGS: FORBID_TAGS_ALL,
        FORBID_ATTR
    }) as HTMLElement;

    // Every link opens a new browsing context that gets neither an opener nor a referrer. Browsers
    // imply noopener for target="_blank", but rel="opener" opts back in and the sender writes rel,
    // and an opener can navigate the page the message is shown in. An <area> is a link too.
    for (const link of dom.querySelectorAll('a, area')) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    }

    // remove specific style properties, touching the CSSOM only where the style text could name one
    for (const node of [dom, ...dom.querySelectorAll<HTMLElement>('[style]')]) {
        if (!node.style) {
            continue;
        }
        const styleText = node.getAttribute('style') || '';
        if (styleText.indexOf('\\') >= 0) {
            // A browser resolves CSS escapes in property names (p\osition is position) but jsdom's
            // CSSOM does not, so the checks below would miss them. Decode first and write the
            // decoded text back so the CSSOM sees the same properties the browser will
            node.setAttribute('style', decodeCssEscapes(styleText));
        }
        removeStyleProperties(node, FORBID_STYLES_RULE);
    }
    removeStyleProperties(dom, BODY_STYLES_RULE);

    const bodyStyles = (dom.getAttribute('style') || '').trim();

    // Two wrappers. The outer one is ours alone and clips everything inside it; the inner one is
    // the message body with the styles it came with. While the body's styles sat on the clipping
    // element, a sender could undo the clipping (display: contents or inline, an overflow-x:
    // visible written after our overflow) or move the element itself over the page around it (a
    // negative margin, a box-shadow or an outline a few thousand pixels wide). Position is the
    // one property that escapes an overflow clip, and it is forbidden above; paint containment
    // makes the outer box the containing block of a fixed or absolute descendant as well, so a
    // position that slipped past the filter would still be clipped by it. The attribute tells
    // the caller the CSS inlining caps were hit
    const marker = inliningSkipped ? ' data-css-inlining="skipped"' : '';
    const body = bodyStyles ? `<div style="${he.encode(bodyStyles)}">` : '<div>';
    return `<div style="overflow: auto; contain: paint;"${marker}>${body}${dom.innerHTML.trim()}</div></div>`;
}

// Runs the pipeline and renders the plain text fallback when it fails, for example when a
// hostile nesting depth overflows the stack of the parser or the serializer.
function guarded<T extends string | Promise<string>>(fn: () => T, message: MimeHtmlMessage, rethrow: boolean): T {
    const onError = (err: unknown): string => {
        if (rethrow) {
            throw err;
        }
        return fallbackHtml(message);
    };
    try {
        const result = fn();
        return (typeof result === 'string' ? result : result.catch(onError)) as T;
    } catch (err) {
        return onError(err) as T;
    }
}

function mimeHtmlSync(message: MimeHtmlMessage): string {
    return guarded(
        () => {
            let { html, hasStyle, inliningSkipped } = prepareHtml(message);
            if (hasStyle) {
                try {
                    // Run juice synchronously - risky but backwards compatible
                    html = juice(html);
                } catch (_err) {
                    // not so important, so we'll ignore if style inlining fails
                }
            }
            return finishHtml(html, inliningSkipped);
        },
        message,
        false
    );
}

async function mimeHtmlAsync(message: MimeHtmlMessage, options: MimeHtmlAsyncOptions = {}): Promise<string> {
    return guarded(
        async () => {
            let { html, hasStyle, inliningSkipped } = prepareHtml(message);
            if (hasStyle) {
                try {
                    // Use worker thread with timeout for juice - provides protection against ANY
                    // unexpected CSS that might cause hangs (beyond our known problematic selectors)
                    html = await juiceWithTimeout(html, options);
                } catch (err) {
                    // If juice fails or times out, continue without inlining styles
                    if (options.fallbackOnError === false) {
                        throw err;
                    }
                }
            }
            return finishHtml(html, inliningSkipped);
        },
        message,
        options.fallbackOnError === false
    );
}

// Main export - maintains backward compatibility with sync API
// Architecture:
// - Both sync and async versions pre-filter known problematic CSS selectors
// - Sync version: Pre-filters selectors, then runs juice synchronously (can still hang on unknown issues)
// - Async version: Pre-filters selectors, then runs juice in worker with timeout (fully protected)
// The timeout in async is a safety net for unknown edge cases, not the primary defense
function mimeHtml(message: MimeHtmlMessage): string {
    // Use the sync version for backward compatibility
    return mimeHtmlSync(message);
}

// Export both versions
mimeHtml.async = mimeHtmlAsync;
mimeHtml.sync = mimeHtmlSync;

// Exposed for tests only, not part of the public API
mimeHtml._internal = { filterCss, hasNotWithPseudo };

// Export function to manually close worker pool
mimeHtml.closeWorkerPool = async () => {
    if (globalWorkerPool) {
        await globalWorkerPool.close();
        globalWorkerPool = null;
    }
};

// Export function to get worker pool stats
mimeHtml.getWorkerPoolStats = (): WorkerPoolStats | null => {
    if (globalWorkerPool) {
        return globalWorkerPool.getStats();
    }
    return null;
};

export default mimeHtml;
