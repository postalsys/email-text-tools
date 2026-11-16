'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readVendorPackages, findAdvisories } = require('../scripts/check-vendor-advisories.cjs');

function fakeFetch(status, body, calls) {
    return async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
}

describe('vendor advisory check', () => {
    it('merges the package lists of every bundle', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-advisories-'));
        try {
            fs.writeFileSync(
                path.join(dir, 'a.packages.json'),
                JSON.stringify([
                    { name: 'entities', version: '9.0.0', license: 'BSD-2-Clause' },
                    { name: 'tldts', version: '7.5.4', license: 'MIT' }
                ])
            );
            fs.writeFileSync(
                path.join(dir, 'b.packages.json'),
                JSON.stringify([
                    { name: 'entities', version: '4.5.0', license: 'BSD-2-Clause' },
                    { name: 'entities', version: '9.0.0', license: 'BSD-2-Clause' }
                ])
            );
            fs.writeFileSync(path.join(dir, 'a.cjs'), '');
            assert.deepStrictEqual(readVendorPackages(dir), { entities: ['9.0.0', '4.5.0'], tldts: ['7.5.4'] });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuses a directory with no package lists', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-advisories-'));
        try {
            assert.throws(() => readVendorPackages(dir), /No \*\.packages\.json/);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reads the package lists the build writes', () => {
        const packages = readVendorPackages(path.join(__dirname, '..', 'dist', 'vendor'));
        assert.ok(packages.jsdom && packages.jsdom.length, 'jsdom is listed');
        assert.ok(packages.juice && packages.juice.length, 'juice is listed');
    });

    it('reports the advisories the registry returns', async () => {
        const calls = [];
        const advisories = await findAdvisories(
            { handlebars: ['4.7.0'], tldts: ['7.5.4'] },
            fakeFetch(
                200,
                {
                    handlebars: [
                        {
                            title: 'Remote code execution',
                            severity: 'critical',
                            url: 'https://github.com/advisories/GHSA-test',
                            vulnerable_versions: '<4.7.7'
                        }
                    ]
                },
                calls
            )
        );
        assert.deepStrictEqual(calls[0].body, { handlebars: ['4.7.0'], tldts: ['7.5.4'] });
        assert.match(calls[0].url, /\/-\/npm\/v1\/security\/advisories\/bulk$/);
        assert.deepStrictEqual(advisories, [
            {
                name: 'handlebars',
                title: 'Remote code execution',
                severity: 'critical',
                url: 'https://github.com/advisories/GHSA-test',
                vulnerableVersions: '<4.7.7'
            }
        ]);
    });

    it('reports nothing when the registry finds nothing', async () => {
        assert.deepStrictEqual(await findAdvisories({ tldts: ['7.5.4'] }, fakeFetch(200, {}, [])), []);
    });

    it('fails when the registry cannot be asked', async () => {
        await assert.rejects(findAdvisories({ tldts: ['7.5.4'] }, fakeFetch(503, null, [])), /HTTP 503/);
    });
});
