'use strict';

module.exports = {
    upgrade: true,
    reject: [
        // Block package upgrades that moved to ESM
        'nanoid',
        // node-html-parser was rejected here on the grounds that 8+ depends on the pure-ESM entities@8.
        // That is not how it ships: node-html-parser 9 bundles entities inline into dist/index.cjs and
        // never require()s the package, so the ESM copy is installed but never loaded. Unpinned 2026-08,
        // which also drops a duplicate parser from EmailEngine's tree (@postalsys/email-content already
        // pulls 9.x). Keep it unpinned unless a release starts require()ing entities for real.
        // 2.0.0 is ESM-only (exports only src/he.mjs), so pkg cannot bundle it. 1.2.0 is the last
        // CommonJS release; EmailEngine and mailparser hold it there too, and a different copy here
        // would be a second he in their trees
        'he',
        // Type declarations follow the runtime package they describe, which is held above
        '@types/he'
    ],
    target: name => {
        // @types/node stays on the 22.x line so the compiler rejects APIs that do
        // not exist on Node 22, the oldest supported version
        if (name === '@types/node') {
            return 'minor';
        }
        // typescript-eslint declares a peer range that excludes TypeScript 7
        if (name === 'typescript') {
            return 'minor';
        }
        // jsdom and juice ship as CommonJS bundles built by scripts/bundle-vendor.js, so neither
        // their ES module only code nor their dependencies hold them back
        return 'latest';
    }
};
