# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build             # produce dist/ (also runs on install and before publish via `prepare`)
npm test                  # build, then run the full suite against dist/
npm run test:cjs          # build, then the CommonJS suite with require(esm) disabled (CommonJS graph guard)
npm run test:coverage     # with experimental coverage
npm run test:watch        # watch mode (does not rebuild, run npm run build after a src/ change)
npm run typecheck         # tsc -p tsconfig.json
npm run lint              # typecheck, then eslint .
npm run lint:fix          # eslint . --fix
npm run format            # prettier --write .
npm run format:check      # prettier --check .
npm run update            # rm -rf node_modules package-lock.json && ncu -u && npm install
```

Run a single test file or a single test by name (uses Node's built-in test runner; build first, the tests load `dist/`):

```bash
node --test test/mime-html.test.cjs
node --test --test-name-pattern="should process HTML in worker thread" test/*.test.cjs
```

Benchmarks are not wired into npm scripts; run them directly after a build, e.g. `node benchmark/benchmark.cjs` (see `benchmark/` and `docs/PERFORMANCE.md`).

## Critical constraints

- **TypeScript, published as a dual package, Node 20 minimum.** See TypeScript layout and Platform constraints below. The CommonJS build is what EmailEngine loads and bundles, so it must stay real CommonJS with the exact pre-TypeScript shape.
- **Releases are automated via release-please.** Version in `package.json` and `CHANGELOG.md` are owned by the bot, do not bump them by hand. Conventional Commits drive it (`fix:` -> patch, `feat:` -> minor); `fix:`/`feat:` commits land directly on `main` and release-please opens the release PR. See Conventions below for the full commit rules.
- **ESLint uses the shared flat config** (`eslint.config.js`, ESLint 10), the TypeScript form shared across the Postal Systems / Nodemailer packages (`../nodemailer/eslint.config.js` and `../pubface/eslint.config.js` are the canonical form, typescript-eslint with type-aware rules for `src/`, eslint-config-prettier last). Keep it identical to the other repos except for `.cts` in the file globs and the "Repo-specific" block at the end, where each override carries a one-line reason. The only override here turns `no-await-in-loop` off for `benchmark/`, which awaits sequentially on purpose. CI (`.github/workflows/test.yaml`) runs lint (typecheck included), `format:check` and the tests on Node 20, 22, 24 and latest, plus `npm run test:cjs` on 22 and later.

## TypeScript layout

The sources are TypeScript under `src/` (`src/index.ts`, `src/lib/*.ts`), compiled by `scripts/build.js` into `dist/esm` (ES modules) and `dist/cjs` (CommonJS), each with type declarations and a `package.json` pinning its module format. `dist/` is gitignored and built by `prepare` on install and before publish. The layout follows `../pubface` and `../nodemailer`.

- `tsconfig.base.json`: strict, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `isolatedModules`, lib `ES2023` + `DOM` (the sanitizer works on jsdom's DOM). `tsconfig.esm.json` / `tsconfig.cjs.json` drive the two builds, `tsconfig.json` is the type-check (`npm run typecheck`). `@types/node` stays on 20.x and `typescript` on 6.x (`.ncurc.cjs`).
- **Every requireable path of the pre-TypeScript package still resolves**: the `exports` map serves `.`, `./index`, `./index.js`, `./lib/<name>` and `./lib/<name>.js` (ES module build for `import`, CommonJS for `require`) and `./package.json`; `typesVersions` maps the `lib/*` paths for `node10` type resolution. Each `lib/` module keeps its CommonJS shape: modules with only a default export are rewritten by the build so `require()` returns the function or class itself (with a non-enumerable `.default`), the build fails if such a module gains named exports too. `html-guard` has named exports only.
- **Two entry points.** `src/index.ts` is the ES module entry and the source of the declarations of both builds; `src/index.cts` is the CommonJS entry (the build renames its `index.cjs` over the `index.js` compiled from `index.ts`). The CommonJS one keeps the pre-TypeScript object: the five helpers as enumerable properties and `mimeHtml` through a getter that `require()`s `lib/mime-html` on first access, so callers that never use it never load jsdom (`test/hardening.test.cjs` checks this in a fresh process). An ES module can not defer a synchronous import, so the ES module entry loads `mimeHtml` up front. Keep the two entries' exports in step.
- **`src/lib/commonjs.cts`** compiles to `commonjs.cjs` in both builds and holds what an ES module can not do the same way in both formats: `JUICE_WORKER_PATH` (`path.join(__dirname, 'juice-worker.js')`, so each build runs its own worker script) and `TLDS` (the `tlds` package only ships `index.json`, which an ES module can not import without import attributes). It uses a plain `require('node:path')` on purpose: `@yao-pkg/pkg` only recognizes the literal `path.join(__dirname, '...')` form when it collects the files a binary needs, and that is how `dist/cjs/lib/juice-worker.js` gets into an EmailEngine binary without an asset entry. Do not turn it into an import.
- Apart from the two `.cts` files, source in `src/` uses ES module syntax only (no `require`, `module`, `__dirname`, `import.meta`), relative imports carry the `.js` extension, Node builtins use the `node:` prefix.
- **Tests run against the build.** The suite (`test/*.test.cjs`) is plain CommonJS that loads the package by name (`require('@postalsys/email-text-tools/lib/mime-html')`, `require('..')`), which goes through the `exports` map. `test/package/cjs-smoke.test.cjs` pins the CommonJS shape and runs the worker pool from `dist/cjs`; `test/package/package.test.mjs` checks the ES module build (named and default exports, its own worker), the packed file list and type-checks consumers against the built declarations. Temporary worker scripts written by the worker pool tests are `.cjs`, since the package is `"type": "module"`.

## Platform constraints

- **Node.js 20 is the minimum supported version** (`engines.node` is `>=20.0.0`). Runtime code, tests and tooling must work on Node 20, 22 and 24.
- **Everything that reaches runtime must be genuinely CommonJS-loadable.** EmailEngine consumes this library and ships as a single-file binary built with [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg), which snapshots a CommonJS module graph and cannot load ES modules. `require()` of this package and of every runtime dependency must work with `--no-experimental-require-module`: Node 22+ (and 20.19) enable require(esm) by default, which hides an ESM-only dependency until the pkg binary fails. A CommonJS entry that only wraps a dynamic `import()` of ESM code does not count.
- **How to check:** `npm run test:cjs` runs the whole CommonJS suite under `NODE_OPTIONS=--no-experimental-require-module`; CI runs it on Node 22 and later. After changing anything about worker paths or the build layout, also build a throwaway `@yao-pkg/pkg` binary that requires the packed tarball and runs `mimeHtml.async()` with `fallbackOnError: false` (pool and `useWorkerPool: false`), the way EmailEngine bundles it.
- **Pins:** never add or upgrade to an ESM-only dependency. Hold the last CommonJS major in `.ncurc.cjs` (`reject` or `target`) with a one-line reason; `npm run update` honors it. Currently rejected: `nanoid`, `jsdom` (27.0.1 pulls an ESM-only parse5), `juice` (12+ is pure ESM and needs Node >=22.12), `linkify-it` (6.0.0 changed exports and stopped linkifying bare domains), `he` (2.0.0 is ESM-only), `@asamuzakjp/css-color`, plus the `@types/*` packages of the held runtime packages (`he`, `jsdom`, `linkify-it`).
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

A small library exposing five text-transformation functions for email content, all re-exported from the entry point (in the CommonJS build `mimeHtml` through a lazy getter, so jsdom only loads on first use):

| Export       | File                      | Purpose                                                     |
| ------------ | ------------------------- | ----------------------------------------------------------- |
| `textToHtml` | `src/lib/text-to-html.ts` | plain text -> HTML (linkified, quote-aware)                 |
| `htmlToText` | `src/lib/html-to-text.ts` | HTML -> plain text                                          |
| `inlineHtml` | `src/lib/inline-html.ts`  | build reply/forward HTML body with quoted original          |
| `inlineText` | `src/lib/inline-text.ts`  | build reply/forward plain-text body with quoted original    |
| `mimeHtml`   | `src/lib/mime-html.ts`    | sanitize + inline-CSS arbitrary email HTML for safe display |

The entry also exports `INLINE_STYLE_BLOCK` (`src/lib/inline-style.ts`, a leaf module with a named export only, so the CommonJS entry exposes it as a plain property without loading jsdom): the default `<style>` block `mimeHtml` prepends to text-only messages. EmailEngine reuses it instead of keeping a copy.

`src/lib/html-guard.ts` holds what `mimeHtml` and `inlineHtml` share before they parse anything: the nesting-depth estimate (`exceedsNestingDepth`, `MAX_NESTING_DEPTH`) and the plain-text fallback projection (`fallbackText`). It does not load jsdom, so `inline-html.ts` can import it eagerly.

### `mimeHtml`: the core, and where the complexity lives

Pipeline (same for sync and async): **DOMPurify sanitize (whole document)** -> **pre-filter problematic CSS** -> **juice (inline `<style>` into element `style=` attributes)** -> **DOMPurify sanitize again (return DOM body)** -> strip forbidden style properties / size constraints, force `target="_blank"` on links, wrap in a styled `<div>`. When the input has only `text` (no `html`), it is first run through `textToHtml` and given a default `<style>` block (`INLINE_STYLE_BLOCK`).

The non-obvious part is **juice hang protection**. Certain modern CSS selectors (`:is()`, `:where()`, `:has()`, `:not(... : ...)`) can make `juice` hang. Two layers defend against this:

1. A linear pre-filter (`filterCss()`, split on `}`, never a regex: the old regex backtracked catastrophically) strips rules using those selectors from head `<style>` tags before juice runs, after capping style text at 256 KB. Input nested deeper than `MAX_NESTING_DEPTH` is not parsed (jsdom tree building is quadratic in depth) and, like any pipeline error, renders the escaped-text `fallbackHtml()`.
2. The async path additionally runs juice inside a **worker thread with a timeout** as a safety net for unknown edge cases. On timeout/failure it falls back to returning the HTML without inlined CSS (unless `fallbackOnError: false`).

`mimeHtml` exposes three forms. Note the default is sync for backward compatibility, but only the async form is fully hang-protected:

- `mimeHtml(message)` / `mimeHtml.sync(message)`: synchronous, runs juice in-process (can still hang on unknown selectors).
- `mimeHtml.async(message, options)`: async, juice in a worker pool with timeout. Options: `timeout`, `useWorkerPool`, `fallbackOnError`, `minWorkers`/`maxWorkers`/`idleTimeout`.
- `mimeHtml.closeWorkerPool()` / `mimeHtml.getWorkerPoolStats()`: manage the lazily-created global worker pool.

`src/lib/worker-pool.ts` (`WorkerPool`) manages a min/max pool of `juice-worker.js` workers (the one of the same build, see `commonjs.cts` above) with task queueing, per-task timeouts, worker replacement on error/timeout, and idle-worker reaping. `src/lib/juice-worker.ts` is a tiny worker entry that just runs `juice(html)` and posts the result back.

### Other modules

- `text-to-html.ts` parses plain text into a nested tree of `text`/`quote` nodes (by `>` prefixes) so multi-level email quotes become nested `<blockquote class="ee-block-N">`. Linkification uses `linkify-it` + full `tlds` list (plus `.onion` and a `git:` alias).
- `inline-html.ts` / `inline-text.ts` produce Apple-Mail-style reply/forward bodies, formatting From/Subject/Date/To/Cc/Bcc headers and quoting the original (HTML via `<blockquote>`, text via `> ` prefixes). Dates use `Intl.DateTimeFormat` via `src/lib/format-date.ts`, honoring `options.locale` (unsupported -> 'en') and `options.tz` (unknown -> UTC).

### Testing notes

Tests use Node's built-in `node:test` runner. Suites that exercise `mimeHtml.async` or `WorkerPool` **must call `await mimeHtml.closeWorkerPool()` (or close the pool) in an `after()` hook**, otherwise live workers keep the process alive and the run hangs.
