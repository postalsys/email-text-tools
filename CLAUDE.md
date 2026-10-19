# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                  # run the full suite (node --test test/*.test.js)
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

- **CommonJS only, never ESM.** This library is consumed by apps packaged into standalone binaries with [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg) (the maintained fork of `vercel/pkg`), which snapshots a CommonJS module graph and cannot reliably load pure-ESM packages. So this package, and every dependency it pulls in, must be CommonJS-compatible. All source uses `require`/`module.exports` with a global `'use strict'` (ESLint enforces `sourceType: 'commonjs'`). The constraint is about the module format, not the syntax level: ESLint parses `ecmaVersion: 2022`, which every supported Node (>=20) and pkg target runs natively. `.ncurc.js` has a `reject` list (`nanoid`, `jsdom`, `juice`, `linkify-it`, `he`, each with its reason) blocking upgrades that moved to pure ESM or changed behavior; `npm run update` honors it. Do not add ESM-only dependencies or bump rejected ones; `juice` is pinned to 11.x for this reason (12+ is pure ESM, requires Node >=22.12, breaks pkg builds). The `require('juice').default || require('juice')` idiom at the require sites is a deliberate CJS-interop fallback, not dead code.
- **Releases are automated via release-please.** Version in `package.json` and `CHANGELOG.md` are owned by the bot, do not bump them by hand. Conventional Commits drive it (`fix:` -> patch, `feat:` -> minor); `fix:`/`feat:` commits land directly on `main` and release-please opens the release PR. See Conventions below for the full commit rules.
- **ESLint uses the shared flat config** (`eslint.config.js`, ESLint 10). It is the CommonJS template shared across the Postal Systems / Nodemailer packages (eslint:recommended plus the retired eslint-config-nodemailer rules, eslint-config-prettier last); keep it identical to the other repos except for the "Repo-specific" block at the end, where each override carries a one-line reason. The only override here turns `no-await-in-loop` off for `benchmark/`, which awaits sequentially on purpose. CI (`.github/workflows/test.yaml`) runs lint, `format:check` and the tests on Node 20, 22 and 24.

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
