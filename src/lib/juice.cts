// juice, loaded from the CommonJS bundle scripts/bundle-vendor.js builds into dist/vendor/juice.cjs.
// juice 12 is an ES module only package, which the CommonJS build must not require(), so the
// package itself is a devDependency and only its bundle ships. This file compiles to juice.cjs in
// dist/cjs/lib and dist/esm/lib alike, both two levels below dist/vendor.
//
// Not part of commonjs.cts on purpose: that module is loaded eagerly, and juice must only load
// when mimeHtml or the juice worker is first used.
//
// The literal require() path is what @yao-pkg/pkg follows to put the bundle into a binary.

import type JuiceModule from 'juice';

// A named export, like jsdom.cts: the ES module build reads it through the CommonJS export names
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const juice = require('../../vendor/juice.cjs') as typeof JuiceModule;
