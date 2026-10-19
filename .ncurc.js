'use strict';

module.exports = {
    upgrade: true,
    reject: [
        // Block package upgrades that moved to ESM
        'nanoid',
        'jsdom', // parse5 dependency in 27.0.1 is ESM only
        'juice', // 12+ is pure ESM (requires Node >=22.12) and breaks pkg builds
        // node-html-parser was rejected here on the grounds that 8+ depends on the pure-ESM entities@8.
        // That is not how it ships: node-html-parser 9 bundles entities inline into dist/index.cjs and
        // never require()s the package, so the ESM copy is installed but never loaded. Unpinned 2026-08,
        // which also drops a duplicate parser from EmailEngine's tree (@postalsys/email-content already
        // pulls 9.x). Keep it unpinned unless a release starts require()ing entities for real.
        // 6.0.0 changed the CommonJS export shape (named bindings instead of the constructor) and,
        // more importantly, stopped linkifying bare domains such as 'example.com' or 'www.example.org'
        // by default, which silently breaks autolinking in plain text emails. Stay on 5.x.
        'linkify-it',
        // 2.0.0 is ESM-only (exports only src/he.mjs) and requires Node >=22, so require('he') throws
        // and pkg cannot bundle it. 1.2.0 is the last CommonJS release; EmailEngine and mailparser
        // hold it there too, and a different copy here would be a second he in their trees
        'he',
        // @asamuzakjp/css-color >=4.1.2 pulls in @csstools/* which are pure ESM, so require(jsdom) fails
        // without require(esm) (jsdom -> cssstyle -> @asamuzakjp/css-color). Held at 4.1.1 through
        // package.json "overrides"; overrides do not propagate to consumers, EmailEngine carries its own.
        '@asamuzakjp/css-color'
    ]
};
