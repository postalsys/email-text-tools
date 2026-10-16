'use strict';

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
// Pinned to juice 11.x: juice 12+ is pure ESM (requires Node >=22.12) and breaks pkg builds.
// The `.default` fallback keeps this working if juice ever ships a CJS-compatible build again.
const juice = require('juice').default || require('juice');
const he = require('he');
const { Worker } = require('worker_threads');
const path = require('path');
const WorkerPool = require('./worker-pool');
const { MAX_NESTING_DEPTH, exceedsNestingDepth, fallbackText } = require('./html-guard');

const textToHtml = require('./text-to-html');

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

// Matches the style text of any element that could carry one of FORBID_STYLES
const FORBID_STYLES_HINT = /position|float|clip|zoom|anim|offset|scrollbar|paint|clear|\ball\b/i;

// A forbidden property in declaration position: at the start, or after any character that cannot
// be part of a longer property name, so "background-position" is not one
const FORBID_STYLES_DECLARATION = new RegExp('(?:^|[^a-z0-9-])(?:' + FORBID_STYLES.join('|') + ')\\s*:', 'i');

// Resolves CSS escape sequences (\6F, \o) the way a browser does before it matches a property
// name, so that a forbidden property cannot hide behind an escaped character
function decodeCssEscapes(value) {
    return value.replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?|\\(.)/gi, (match, hex, chr) => {
        if (hex) {
            let code = parseInt(hex, 16);
            return code && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
        }
        return chr;
    });
}

// keep the style at first
const FORBID_TAGS_ALL = ['style'].concat(FORBID_TAGS);

// One sanitizer for the module. Every sanitize() call passes its full config, so calls do not
// leak settings into each other.
const DOMPurify = createDOMPurify(new JSDOM('').window);

// Global worker pool instance (lazy initialization)
let globalWorkerPool = null;

function getWorkerPool(options = {}) {
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
async function juiceWithTimeout(html, options = {}) {
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
        const worker = new Worker(path.join(__dirname, 'juice-worker.js'));
        let timedOut = false;

        const timeout = setTimeout(() => {
            timedOut = true;
            worker.terminate();
            reject(new Error('Juice processing timed out - likely due to unsupported CSS selectors'));
        }, timeoutMs);

        worker.on('message', msg => {
            clearTimeout(timeout);
            worker.terminate();
            if (msg.success) {
                resolve(msg.result);
            } else {
                reject(new Error(msg.error));
            }
        });

        worker.on('error', err => {
            clearTimeout(timeout);
            if (!timedOut) {
                reject(err);
            }
        });

        worker.postMessage(html);
    });
}

const INLINE_STYLE_BLOCK = `<style>

body, td, th, p {
    font-family: sans-serif;
    font-size: 12px;
}

blockquote {
    border-left-width: 2px;
    border-left-style: solid;
    
    border-left-color: darkblue;
    color: darkblue;

    margin: 1rem 0;
    padding-left: 1rem;
}

blockquote blockquote{
    border-left-color: royalblue;
    color: royalblue;
}

blockquote blockquote blockquote{
    border-left-color: dodgerblue;
    color: dodgerblue;
}

blockquote blockquote blockquote blockquote{
    border-left-color: darkblue;
    color: darkblue;
}

</style>`;

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
function countSelectors(css) {
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
function fallbackHtml(message) {
    let text = message.text;
    if (!text && message.html) {
        text = fallbackText(message.html.toString());
    }
    return `<div style="overflow: auto;"><div style="white-space: pre-wrap;">${he.encode((text || '').toString(), { useNamedReferences: true })}</div></div>`;
}

// True when a :not( argument contains another colon. Such selectors, like :is(), :where() and
// :has(), can make juice hang. A single pass with a paren counter keeps this linear, the regex
// it replaces backtracked catastrophically on a few hundred bytes of repeated ":not(a:b)".
function hasNotWithPseudo(selector) {
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
            if (selector.substr(i + 1, 4).toLowerCase() === 'not(') {
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

function isProblematicSelector(selector) {
    const lower = selector.toLowerCase();
    return lower.includes(':is(') || lower.includes(':where(') || lower.includes(':has(') || hasNotWithPseudo(selector);
}

// Drops every rule whose selector could make juice hang. The text is split into rules on "}" and
// the selector of each rule is the text between the last two "{" in it, so a rule nested in an
// at-rule is dropped without its enclosing block.
function filterCss(css) {
    if (!/:(is|where|has|not)\(/i.test(css)) {
        return css;
    }
    const pieces = css.split('}');
    const output = [];
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
function prepareHtml(message) {
    let html = message.html;
    if (!html && message.text) {
        html = textToHtml(message.text) || '';
        if (html) {
            html = INLINE_STYLE_BLOCK + html;
        }
    }

    html = (html || '').toString().replace(/^"data:[^"]+"/g, '');

    if (exceedsNestingDepth(html, MAX_NESTING_DEPTH)) {
        throw new Error('HTML is nested too deep to process');
    }

    // first pass, returns the <html> element of the fixed HTML page
    const root = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, FORCE_BODY: false, FORBID_TAGS, FORBID_ATTR, RETURN_DOM: true });

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

// Second sanitization pass and post-processing of the juice output.
function finishHtml(html, inliningSkipped) {
    // second pass, outputs a BODY DOM element
    const dom = DOMPurify.sanitize(html, {
        RETURN_DOM: true,
        WHOLE_DOCUMENT: false,
        FORCE_BODY: true,
        FORBID_TAGS: FORBID_TAGS_ALL,
        FORBID_ATTR
    });

    // mark all links to be opened in a new window
    for (let elm of dom.querySelectorAll('a')) {
        elm.setAttribute('target', '_blank');
    }

    dom.style.overflow = 'auto';

    // return <BODY> HTML
    dom.style.removeProperty('width');
    dom.style.removeProperty('min-width');
    dom.style.removeProperty('max-width');
    dom.style.removeProperty('height');
    dom.style.removeProperty('min-height');
    dom.style.removeProperty('max-height');

    // remove specific style properties, touching the CSSOM only where the style text could name one
    for (const node of [dom, ...dom.querySelectorAll('[style]')]) {
        if (!node.style) {
            continue;
        }
        let styleText = node.getAttribute('style') || '';
        if (styleText.indexOf('\\') >= 0) {
            // A browser resolves CSS escapes in property names (p\osition is position) but jsdom's
            // CSSOM does not, so the check below would miss them. Decode first and write the
            // decoded text back so the CSSOM sees the same properties the browser will
            styleText = decodeCssEscapes(styleText);
            node.setAttribute('style', styleText);
        }
        if (FORBID_STYLES_HINT.test(styleText)) {
            for (let disallowedStyle of FORBID_STYLES) {
                node.style.removeProperty(disallowedStyle);
            }
            // removeProperty() rewrites the attribute from the CSSOM, which only holds the
            // declarations cssstyle managed to parse. A forbidden property still named in the
            // attribute after that was never parsed and would go out verbatim for the browser to
            // read its own way: cssstyle 5 parses nothing from an attribute whose "background:
            // url()" shorthand is followed by more declarations, a browser reads every one of
            // them. Keep only what the CSSOM parsed, which may be nothing
            if (FORBID_STYLES_DECLARATION.test(node.getAttribute('style') || '')) {
                const parsed = node.style.cssText;
                if (parsed) {
                    node.setAttribute('style', parsed);
                } else {
                    node.removeAttribute('style');
                }
            }
        }
    }

    let bodyStyles = (dom.getAttribute('style') || '').toString().trim();

    // embed into a styled container; the attribute tells the caller the CSS inlining caps were hit
    const marker = inliningSkipped ? ' data-css-inlining="skipped"' : '';
    return `<div style="${he.encode(bodyStyles)}"${marker}>${dom.innerHTML.trim()}</div>`;
}

// Runs the pipeline and renders the plain text fallback when it fails, for example when a
// hostile nesting depth overflows the stack of the parser or the serializer.
function guarded(fn, message, rethrow) {
    const onError = err => {
        if (rethrow) {
            throw err;
        }
        return fallbackHtml(message);
    };
    try {
        const result = fn();
        return result && typeof result.then === 'function' ? result.catch(onError) : result;
    } catch (err) {
        return onError(err);
    }
}

function mimeHtmlSync(message) {
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

async function mimeHtmlAsync(message, options = {}) {
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
function mimeHtml(message) {
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
mimeHtml.getWorkerPoolStats = () => {
    if (globalWorkerPool) {
        return globalWorkerPool.getStats();
    }
    return null;
};

module.exports = mimeHtml;
