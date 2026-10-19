import he from 'he';

// jsdom builds a tree in time quadratic to its depth (10,000 unclosed <b> tags take about 9 s) and
// its serializer overflows the stack a few thousand levels down; node-html-parser spends cubic time
// on the elements left open at the end of a document. Deeper input is not parsed at all. Real
// email nests a few dozen levels.
export const MAX_NESTING_DEPTH = 1000;

// Elements that never stay open in HTML content, either void or closed implicitly by a sibling,
// so they do not add to the depth an HTML parser ends up with. Inside SVG and MathML they can nest,
// so there every start tag counts.
const NON_NESTING_TAGS = new Set(
    'area,base,br,col,embed,hr,img,input,keygen,link,meta,param,source,track,wbr,p,li,dt,dd,td,th,tr,tbody,thead,tfoot,colgroup,caption,option,optgroup,rt,rp'.split(
        ','
    )
);

// A single linear pass estimating how deep the parsed tree would get. An end tag closes the
// nearest open element of its name together with everything opened inside it, and one that names
// no open element is ignored, as an HTML parser ignores it: counting every end tag down instead
// let "<b></i>" repeated nest as deep as the input allowed, and 10,000 copies took jsdom ten
// seconds. Otherwise the estimate only ever overestimates (tags inside comments, attribute values
// and raw text count too), which at worst means an extreme message is shown as plain text.
export function exceedsNestingDepth(html: string, maxDepth: number): boolean {
    const tagName = /[a-z][a-z0-9:-]*/iy;
    const stack: string[] = [];
    const open = new Map<string, number>();
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
            if (!open.get(name)) {
                continue;
            }
            let popped: string;
            do {
                // the end tag names an open element, so the stack can not run out before it
                popped = stack.pop()!;
                open.set(popped, open.get(popped)! - 1);
                if (popped === 'svg' || popped === 'math') {
                    foreign--;
                }
            } while (popped !== name);
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

        stack.push(name);
        open.set(name, (open.get(name) || 0) + 1);
        if (stack.length > maxDepth) {
            return true;
        }
    }
    return false;
}

// The text of an HTML body for a fallback rendering. The fallback runs when the HTML could not be
// processed (hostile nesting, a parser or serializer overflow), so it cannot lean on a real HTML
// parser either: html-to-text gives up on a body nested past its own limit and returned nothing
// for exactly the input that lands here. One pass over the string: tags become a space, style and
// script blocks are dropped whole, entities are decoded once
export function fallbackText(html: string): string {
    const lower = html.toLowerCase();
    const parts: string[] = [];
    let pos = 0;
    while (pos < html.length) {
        const lt = html.indexOf('<', pos);
        if (lt < 0) {
            parts.push(html.slice(pos));
            break;
        }
        parts.push(html.slice(pos, lt));
        const gt = html.indexOf('>', lt + 1);
        if (gt < 0) {
            // an unterminated tag runs to the end of the input
            break;
        }
        const name = /^(style|script)(?:[\s/]|$)/.exec(lower.slice(lt + 1, gt));
        if (name) {
            const close = lower.indexOf('</' + name[1], gt + 1);
            const closeEnd = close < 0 ? -1 : html.indexOf('>', close);
            if (closeEnd < 0) {
                break;
            }
            pos = closeEnd + 1;
        } else {
            pos = gt + 1;
        }
        parts.push(' ');
    }
    return he.decode(parts.join(''));
}
