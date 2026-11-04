// jsdom, loaded from the CommonJS bundle scripts/bundle-jsdom.js builds into dist/vendor/jsdom.cjs.
// jsdom pulls in ES module only packages (parse5 among them), which the CommonJS build must not
// require(), so the package itself is a devDependency and only its bundle ships. This file compiles
// to jsdom.cjs in dist/cjs/lib and dist/esm/lib alike, both two levels below dist/vendor.
//
// Not part of commonjs.cts on purpose: that module is loaded eagerly (text-to-html reads TLDS from
// it), and jsdom must only load when mimeHtml is first used.
//
// The literal require() path is what @yao-pkg/pkg follows to put the bundle into a binary.

import type * as Jsdom from 'jsdom';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jsdom = require('../../vendor/jsdom.cjs') as typeof Jsdom;

export const JSDOM: typeof Jsdom.JSDOM = jsdom.JSDOM;
