module.exports = {
    upgrade: true,
    reject: [
        // Block package upgrades that moved to ESM
        'nanoid',
        'jsdom', // parse5 dependency in 27.0.1 is ESM only
        'juice' // 12+ is pure ESM (requires Node >=22.12) and breaks pkg builds
    ]
};
