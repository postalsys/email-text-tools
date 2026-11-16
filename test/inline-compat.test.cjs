'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tools = require('..');
const { listCases, render } = require('./fixtures/inline-cases.cjs');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'inline-english.json');

// The English reply and forward headers were hardcoded text until they became one entry of a
// translation table. These fixtures hold the output of the last release before that, so the
// table is checked to reproduce it byte for byte: default locale, `en` and `en-GB`.
describe('inline English compatibility', () => {
    const cases = listCases();

    if (process.env.UPDATE_INLINE_COMPAT_FIXTURES === 'true') {
        const recorded = {};
        for (const entry of cases) {
            recorded[entry.id] = render(tools, entry);
        }
        fs.writeFileSync(FIXTURE_PATH, JSON.stringify(recorded, null, 4) + '\n');
    }

    const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    it('should have a fixture for every case', () => {
        assert.deepEqual(Object.keys(fixtures).sort(), cases.map(entry => entry.id).sort());
    });

    for (const entry of cases) {
        it(`should render ${entry.id} as before`, () => {
            assert.deepEqual(render(tools, entry), fixtures[entry.id]);
        });
    }
});
