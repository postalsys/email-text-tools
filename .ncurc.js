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
        'linkify-it'
    ]
};
