// What an ES module can not do the same way in both builds. This file compiles to
// commonjs.cjs in dist/cjs and in dist/esm alike, so __dirname is the directory of the
// build that loaded it and require() is available to both.

// A plain require() keeps the call below in the literal path.join(__dirname, '...') form, the
// one form @yao-pkg/pkg recognizes when it collects the files a binary needs (a default import
// compiles to path_1.default.join, which it does not). Without it the worker script is left out
// of an EmailEngine binary
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path') as typeof import('node:path');

/** The worker script that runs juice off the main thread, the one of the same build */
export const JUICE_WORKER_PATH: string = path.join(__dirname, 'juice-worker.js');

/** The top level domain list of the tlds package, which only ships it as index.json */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const TLDS: string[] = require('tlds');
