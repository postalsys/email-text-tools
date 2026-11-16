'use strict';

// Checks the packages bundled into dist/vendor/*.cjs against the npm advisory database.
//
// jsdom, juice and everything they depend on are compiled into dist/vendor by
// scripts/bundle-vendor.js, so they are not in package-lock.json and `npm audit`, here or in
// any project that installs this package, never sees them. bundle-vendor.js records each bundle's
// packages in dist/vendor/<name>.packages.json; this script sends those name/version pairs to
// the registry's bulk advisory endpoint, which answers with the advisories affecting exactly
// those versions, and fails when there are any.
//
// Run by `npm run update` and in CI. Needs network access to the registry.

const fs = require('node:fs');
const path = require('node:path');

const ADVISORY_ENDPOINT = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const VENDOR_DIR = path.join(__dirname, '..', 'dist', 'vendor');

/**
 * Reads every dist/vendor/*.packages.json into one { name: [versions] } map.
 *
 * @param {string} dir Directory holding the package lists
 * @returns {Record<string, string[]>}
 */
function readVendorPackages(dir) {
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.packages.json'));
    if (!files.length) {
        throw new Error(`No *.packages.json in ${dir}, run npm run build first`);
    }
    const packages = {};
    for (const file of files) {
        for (const { name, version } of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))) {
            const versions = (packages[name] = packages[name] || []);
            if (!versions.includes(version)) {
                versions.push(version);
            }
        }
    }
    return packages;
}

/**
 * Asks the registry for advisories affecting the given package versions.
 *
 * @param {Record<string, string[]>} packages Versions to check, by package name
 * @param {typeof fetch} [fetchImpl] Injected by the tests
 * @returns {Promise<Array<{ name: string, title: string, severity: string, url: string, vulnerableVersions: string }>>}
 */
async function findAdvisories(packages, fetchImpl = fetch) {
    const res = await fetchImpl(ADVISORY_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(packages)
    });
    if (!res.ok) {
        throw new Error(`Advisory lookup failed with HTTP ${res.status}`);
    }
    const body = await res.json();
    const found = [];
    for (const [name, advisories] of Object.entries(body || {})) {
        for (const advisory of advisories || []) {
            found.push({
                name,
                title: advisory.title,
                severity: advisory.severity,
                url: advisory.url,
                vulnerableVersions: advisory.vulnerable_versions
            });
        }
    }
    return found;
}

async function main() {
    const packages = readVendorPackages(VENDOR_DIR);
    const advisories = await findAdvisories(packages);
    const count = Object.keys(packages).length;
    if (!advisories.length) {
        console.log(`No advisories for the ${count} bundled packages in dist/vendor`);
        return;
    }
    for (const advisory of advisories) {
        console.error(
            `${advisory.severity}: ${advisory.name}@${packages[advisory.name].join(', ')} (${advisory.vulnerableVersions}) ${advisory.title} ${advisory.url}`
        );
    }
    console.error(`${advisories.length} advisories affect packages bundled into dist/vendor; update the bundle sources and rebuild`);
    process.exitCode = 1;
}

if (require.main === module) {
    main().catch(err => {
        console.error(err.message);
        process.exitCode = 1;
    });
}

module.exports = { readVendorPackages, findAdvisories };
