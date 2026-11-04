'use strict';

module.exports = {
    upgrade: true,
    reject: [
        // Block package upgrades that moved to ESM
        'nanoid',
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
        // Type declarations follow the runtime package they describe, which is held above
        '@types/he',
        '@types/linkify-it'
    ],
    target: name => {
        // @types/node stays on the 20.x line so the compiler rejects APIs that do
        // not exist on Node 20, the oldest supported version
        if (name === '@types/node') {
            return 'minor';
        }
        // typescript-eslint declares a peer range that excludes TypeScript 7
        if (name === 'typescript') {
            return 'minor';
        }
        // jsdom ships as a CommonJS bundle built by scripts/bundle-jsdom.js, so its ES module only
        // dependencies no longer hold it back. 30.x requires Node >=22.22 and the bundle runs on the
        // Node 20 floor, so it stays on 29.x; its type declarations follow (28.x is the newest below 30)
        if (name === 'jsdom' || name === '@types/jsdom') {
            return 'minor';
        }
        return 'latest';
    }
};
