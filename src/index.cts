// The CommonJS entry point, compiled by scripts/build.js into dist/cjs/index.js. index.ts is the
// ES module entry and the source of the type declarations of both.
//
// require() returns the same object as before the TypeScript build: the five helpers as plain
// enumerable properties, mimeHtml through a getter. mimeHtml loads jsdom, which costs tens of
// megabytes of heap, so it is only loaded on first access and callers that only need the other
// helpers never pay for it.

import textToHtml from './lib/text-to-html.js';
import htmlToText from './lib/html-to-text.js';
import inlineHtml from './lib/inline-html.js';
import inlineText from './lib/inline-text.js';
import type mimeHtml from './lib/mime-html.js';

const textTools = { textToHtml, htmlToText, inlineHtml, inlineText } as {
    textToHtml: typeof textToHtml;
    htmlToText: typeof htmlToText;
    inlineHtml: typeof inlineHtml;
    inlineText: typeof inlineText;
    readonly mimeHtml: typeof mimeHtml;
};

Object.defineProperty(textTools, 'mimeHtml', {
    enumerable: true,
    get(): typeof mimeHtml {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('./lib/mime-html.js');
    }
});

// What TypeScript and Babel generated `import textTools from '...'` code reads, as the
// declarations promise a default export
Object.defineProperty(textTools, 'default', { value: textTools, enumerable: false, writable: true, configurable: true });

module.exports = textTools;
