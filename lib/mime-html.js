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

const textToHtml = require('./text-to-html');
const htmlToText = require('./html-to-text');

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

// jsdom builds a tree in time quadratic to its depth (10,000 unclosed <b> tags take about 9 s) and
// its serializer overflows the stack a few thousand levels down, so deeper input is not parsed at all.
// Real email nests a few dozen levels.
const MAX_NESTING_DEPTH = 1000;

// Elements that never stay open in HTML content, either void or closed implicitly by a sibling,
// so they do not add to the depth an HTML parser ends up with. Inside SVG and MathML they can nest,
// so there every start tag counts.
const NON_NESTING_TAGS = new Set(
    'area,base,br,col,embed,hr,img,input,keygen,link,meta,param,source,track,wbr,p,li,dt,dd,td,th,tr,tbody,thead,tfoot,colgroup,caption,option,optgroup,rt,rp'.split(
        ','
    )
);

// A single linear pass estimating how deep the parsed tree would get. It only ever overestimates
// (tags inside comments, attribute values and raw text count too), which at worst means an
// extreme message is shown as plain text.
function exceedsNestingDepth(html, maxDepth) {
    const tagName = /[a-z][a-z0-9:-]*/iy;
    let depth = 0;
    let foreign = 0;
    let pos = 0;
    while (pos < html.length) {
        const tagStart = html.indexOf('<', pos);
        if (tagStart < 0) {
            break;
        }
        const tagEnd = html.indexOf('>', tagStart + 1);
        if (tagEnd < 0) {
            break;
        }
        // resume right after the first ">", so no tag the parser would see is ever skipped
        pos = tagEnd + 1;

        const closing = html.charAt(tagStart + 1) === '/';
        tagName.lastIndex = tagStart + (closing ? 2 : 1);
        const nameMatch = tagName.exec(html);
        if (!nameMatch) {
            continue;
        }
        const name = nameMatch[0].toLowerCase();
        const isForeignRoot = name === 'svg' || name === 'math';

        if (closing) {
            if (isForeignRoot && foreign > 0) {
                foreign--;
            }
            if (depth > 0 && (foreign || !NON_NESTING_TAGS.has(name))) {
                depth--;
            }
            continue;
        }

        if (!foreign && NON_NESTING_TAGS.has(name)) {
            continue;
        }

        // a self-closing flag is ignored on HTML elements, only SVG and MathML honor it
        if ((foreign || isForeignRoot) && html.charAt(tagEnd - 1) === '/') {
            continue;
        }

        if (isForeignRoot) {
            foreign++;
        }

        depth++;
        if (depth > maxDepth) {
            return true;
        }
    }
    return false;
}

// Rendered in place of the sanitized HTML when the pipeline cannot process the input at all, for
// example when a hostile nesting depth overflows the stack of the parser or the serializer.
function fallbackHtml(message) {
    let text = message.text;
    if (!text && message.html) {
        text = htmlToText(message.html.toString());
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
        }
    });

    return { html: root.outerHTML, hasStyle };
}

// Second sanitization pass and post-processing of the juice output.
function finishHtml(html) {
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
        }
    }

    let bodyStyles = (dom.getAttribute('style') || '').toString().trim();

    // embed into a styled container
    return `<div style="${he.encode(bodyStyles)}">${dom.innerHTML.trim()}</div>`;
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
            let { html, hasStyle } = prepareHtml(message);
            if (hasStyle) {
                try {
                    // Run juice synchronously - risky but backwards compatible
                    html = juice(html);
                } catch (_err) {
                    // not so important, so we'll ignore if style inlining fails
                }
            }
            return finishHtml(html);
        },
        message,
        false
    );
}

async function mimeHtmlAsync(message, options = {}) {
    return guarded(
        async () => {
            let { html, hasStyle } = prepareHtml(message);
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
            return finishHtml(html);
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
