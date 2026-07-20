module.exports = {
    upgrade: true,
    reject: [
        // Block package upgrades that moved to ESM
        'nanoid',
        'jsdom', // parse5 dependency in 27.0.1 is ESM only
        'juice', // 12+ is pure ESM (requires Node >=22.12) and breaks pkg builds
        'node-html-parser', // 8+ depends on entities@8, which is pure ESM (no require export) and breaks CJS/pkg builds on Node <20.19; stay on 7.x (uses he)
        // 6.0.0 changed the CommonJS export shape (named bindings instead of the constructor) and,
        // more importantly, stopped linkifying bare domains such as 'example.com' or 'www.example.org'
        // by default, which silently breaks autolinking in plain text emails. Stay on 5.x.
        'linkify-it'
    ]
};
