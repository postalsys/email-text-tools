# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                  # run the full suite (node --test test/*.test.js)
npm run test:cjs          # the suite with require(esm) disabled (CommonJS graph guard)
npm run test:coverage     # with experimental coverage
npm run test:watch        # watch mode
npm run lint              # eslint .
npm run lint:fix          # eslint . --fix
npm run format            # prettier --write .
npm run format:check      # prettier --check .
npm run update            # rm -rf node_modules package-lock.json && ncu -u && npm install
```

Run a single test file or a single test by name (uses Node's built-in test runner):

```bash
node --test test/mime-html.test.js
node --test --test-name-pattern="should process HTML in worker thread"
```

Benchmarks are not wired into npm scripts; run them directly, e.g. `node benchmark/benchmark.js` (see `benchmark/` and `docs/PERFORMANCE.md`).

## Critical constraints

- **CommonJS only, Node 20 minimum.** See Platform constraints below. All source uses `require`/`module.exports` with a global `'use strict'` (ESLint enforces `sourceType: 'commonjs'`). The constraint is about the module format, not the syntax level: ESLint parses `ecmaVersion: 2022`, which every supported Node (>=20) and pkg target runs natively. The `require('juice').default || require('juice')` idiom at the require sites is a deliberate CJS-interop fallback, not dead code.
- **Releases are automated via release-please.** Version in `package.json` and `CHANGELOG.md` are owned by the bot, do not bump them by hand. Conventional Commits drive it (`fix:` -> patch, `feat:` -> minor); `fix:`/`feat:` commits land directly on `main` and release-please opens the release PR. See Conventions below for the full commit rules.
- **ESLint uses the shared flat config** (`eslint.config.js`, ESLint 10). It is the CommonJS template shared across the Postal Systems / Nodemailer packages (eslint:recommended plus the retired eslint-config-nodemailer rules, eslint-config-prettier last); keep it identical to the other repos except for the "Repo-specific" block at the end, where each override carries a one-line reason. The only override here turns `no-await-in-loop` off for `benchmark/`, which awaits sequentially on purpose. CI (`.github/workflows/test.yaml`) runs lint, `format:check` and the tests on Node 20, 22 and 24, plus `npm run test:cjs` on 22 and 24.

## Platform constraints

- **Node.js 20 is the minimum supported version** (`engines.node` is `>=20.0.0`). Runtime code, tests and tooling must work on Node 20, 22 and 24.
- **Everything that reaches runtime must be genuinely CommonJS-loadable.** EmailEngine consumes this library and ships as a single-file binary built with [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg), which snapshots a CommonJS module graph and cannot load ES modules. `require()` of this package and of every runtime dependency must work with `--no-experimental-require-module`: Node 22+ (and 20.19) enable require(esm) by default, which hides an ESM-only dependency until the pkg binary fails. A CommonJS entry that only wraps a dynamic `import()` of ESM code does not count.
- **How to check:** `npm run test:cjs` runs the whole suite under `NODE_OPTIONS=--no-experimental-require-module`; CI runs it on Node 22 and 24.
- **Pins:** never add or upgrade to an ESM-only dependency. Hold the last CommonJS major in `.ncurc.js` (`reject` or `target`) with a one-line reason; `npm run update` honors it. Currently rejected: `nanoid`, `jsdom` (27.0.1 pulls an ESM-only parse5), `juice` (12+ is pure ESM and needs Node >=22.12), `linkify-it` (6.0.0 changed exports and stopped linkifying bare domains), `he` (2.0.0 is ESM-only), `@asamuzakjp/css-color`.
- **The jsdom chain:** jsdom -> cssstyle -> `@asamuzakjp/css-color` >=4.1.2 pulls in `@csstools/*` v4, which are pure ESM. `package.json` `"overrides"` holds `@asamuzakjp/css-color` at 4.1.1 so this repo's own tests and CI exercise the CommonJS graph. Overrides do not propagate to consumers: an app installing this package resolves css-color itself, and EmailEngine carries its own identical override and `.ncurc.js` reject.

## Conventions

These mirror the conventions used across Postal Systems projects (see `../emailengine`).

**Git commits**

- Use Conventional Commits: `fix:` (patch release), `feat:` (minor release), and `chore:`/`build:`/`ci:`/`docs:`/`refactor:`/`style:`/`test:` for changes that should not trigger a release. release-please derives the version and changelog from these prefixes.
- Do **not** list Claude or any AI assistant as a co-author / co-contributor in commit messages or PR descriptions (no `Co-Authored-By` trailer).
- Append `[skip ci]` to commits that do not change runtime behavior (docs, comments, CI/workflow tweaks, formatting) to avoid spending CI minutes. Exception: never add `[skip ci]` to a `fix:` or `feat:` commit, those must run so the release workflow triggers.

**Code & docs style**

- No emojis anywhere in code or documentation, printable ASCII only.
- Use a single hyphen-minus (`-`) as a dash in user-facing strings and docs. Never use double hyphens (`--`), em dashes, or en dashes.

**Before committing code changes**

1. `npm run format` and `npm run lint`
2. `npm test`
3. For non-trivial changes, consider `/simplify` (quality cleanup) and `/security-review`. This library sanitizes untrusted HTML, so anything touching the `mimeHtml` pipeline is security-sensitive.

**After pushing**

- Check the workflow runs for the push (`gh run list --branch <branch>`) and report their status. If a run fails for an unrelated/infrastructure reason (checkout reporting "account suspended", HTTP 403, other auth errors), check <https://www.githubstatus.com/> for an active GitHub incident before assuming the change caused it.

## Architecture

A small CommonJS library exposing five text-transformation functions for email content, all re-exported from `index.js` (`mimeHtml` through a lazy getter, so jsdom only loads on first use):

| Export       | File                  | Purpose                                                     |
| ------------ | --------------------- | ----------------------------------------------------------- |
| `textToHtml` | `lib/text-to-html.js` | plain text -> HTML (linkified, quote-aware)                 |
| `htmlToText` | `lib/html-to-text.js` | HTML -> plain text                                          |
| `inlineHtml` | `lib/inline-html.js`  | build reply/forward HTML body with quoted original          |
| `inlineText` | `lib/inline-text.js`  | build reply/forward plain-text body with quoted original    |
| `mimeHtml`   | `lib/mime-html.js`    | sanitize + inline-CSS arbitrary email HTML for safe display |

`lib/html-guard.js` holds what `mimeHtml` and `inlineHtml` share before they parse anything: the nesting-depth estimate (`exceedsNestingDepth`, `MAX_NESTING_DEPTH`) and the plain-text fallback projection (`fallbackText`). It does not load jsdom, so `inline-html.js` can require it eagerly.

### `mimeHtml`: the core, and where the complexity lives

Pipeline (same for sync and async): **DOMPurify sanitize (whole document)** -> **pre-filter problematic CSS** -> **juice (inline `<style>` into element `style=` attributes)** -> **DOMPurify sanitize again (return DOM body)** -> strip forbidden style properties / size constraints, force `target="_blank"` on links, wrap in a styled `<div>`. When the input has only `text` (no `html`), it is first run through `textToHtml` and given a default `<style>` block (`INLINE_STYLE_BLOCK`).

The non-obvious part is **juice hang protection**. Certain modern CSS selectors (`:is()`, `:where()`, `:has()`, `:not(... : ...)`) can make `juice` hang. Two layers defend against this:

1. A linear pre-filter (`filterCss()`, split on `}`, never a regex: the old regex backtracked catastrophically) strips rules using those selectors from head `<style>` tags before juice runs, after capping style text at 256 KB. Input nested deeper than `MAX_NESTING_DEPTH` is not parsed (jsdom tree building is quadratic in depth) and, like any pipeline error, renders the escaped-text `fallbackHtml()`.
2. The async path additionally runs juice inside a **worker thread with a timeout** as a safety net for unknown edge cases. On timeout/failure it falls back to returning the HTML without inlined CSS (unless `fallbackOnError: false`).

`mimeHtml` exposes three forms. Note the default is sync for backward compatibility, but only the async form is fully hang-protected:

- `mimeHtml(message)` / `mimeHtml.sync(message)`: synchronous, runs juice in-process (can still hang on unknown selectors).
- `mimeHtml.async(message, options)`: async, juice in a worker pool with timeout. Options: `timeout`, `useWorkerPool`, `fallbackOnError`, `minWorkers`/`maxWorkers`/`idleTimeout`.
- `mimeHtml.closeWorkerPool()` / `mimeHtml.getWorkerPoolStats()`: manage the lazily-created global worker pool.

`lib/worker-pool.js` (`WorkerPool`) manages a min/max pool of `lib/juice-worker.js` workers with task queueing, per-task timeouts, worker replacement on error/timeout, and idle-worker reaping. `lib/juice-worker.js` is a tiny worker entry that just runs `juice(html)` and posts the result back.

### Other modules

- `text-to-html.js` parses plain text into a nested tree of `text`/`quote` nodes (by `>` prefixes) so multi-level email quotes become nested `<blockquote class="ee-block-N">`. Linkification uses `linkify-it` + full `tlds` list (plus `.onion` and a `git:` alias).
- `inline-html.js` / `inline-text.js` produce Apple-Mail-style reply/forward bodies, formatting From/Subject/Date/To/Cc/Bcc headers and quoting the original (HTML via `<blockquote>`, text via `> ` prefixes). Dates use `Intl.DateTimeFormat` via `lib/format-date.js`, honoring `options.locale` (unsupported -> 'en') and `options.tz` (unknown -> UTC).

### Testing notes

Tests use Node's built-in `node:test` runner. Suites that exercise `mimeHtml.async` or `WorkerPool` **must call `await mimeHtml.closeWorkerPool()` (or close the pool) in an `after()` hook**, otherwise live workers keep the process alive and the run hangs.
