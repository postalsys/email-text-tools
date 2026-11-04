// Bundles jsdom and everything it loads into one CommonJS file, dist/vendor/jsdom.cjs.
//
// jsdom is what DOMPurify sanitizes on, so its HTML parser (parse5) decides how hostile markup is
// read before it is cleaned. From 27.0.1 jsdom depends on an ES module only parse5, and later
// releases pull in more ES module only packages (@asamuzakjp/*, @exodus/bytes, tough-cookie).
// The CommonJS build has to stay loadable without require(esm), because EmailEngine bundles it
// into a binary with @yao-pkg/pkg, which cannot load ES modules. Rather than holding jsdom on
// 27.0.0 forever, the build turns it into real CommonJS here, so parser fixes keep arriving.
//
// jsdom is a devDependency for that reason: nothing at runtime resolves the package itself.
//
// Two jsdom internals do not survive bundling and are patched in place. The build fails when a
// patch did not apply, whether its pattern stopped matching or its file moved, rather than
// shipping a bundle that breaks at runtime:
// - the default stylesheet is read from a path relative to __dirname, so it is inlined
// - the synchronous XMLHttpRequest worker is located with require.resolve() at load time. This
//   library never runs scripts or loads resources, so the path is replaced with null.
//
// The licenses of every bundled package are written to dist/vendor/jsdom.LICENSES.txt and the
// package list to dist/vendor/jsdom.packages.json, so a consumer's license listing can name them.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const SEPARATOR = '\n\n' + '-'.repeat(72) + '\n\n';

const PATCHES = [
    {
        file: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/,
        pattern: /fs\.readFileSync\(\s*path\.resolve\(__dirname, "\.\.\/\.\.\/\.\.\/browser\/default-stylesheet\.css"\),\s*\{\s*encoding: "utf-8"\s*\}\s*\)/,
        replacement: jsdomDir => JSON.stringify(fs.readFileSync(path.join(jsdomDir, 'lib', 'jsdom', 'browser', 'default-stylesheet.css'), 'utf8'))
    },
    {
        file: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/,
        pattern: /require\.resolve\("\.\/xhr-sync-worker\.js"\)/,
        replacement: () => 'null'
    }
];

function jsdomPatches(jsdomDir, applied) {
    return {
        name: 'jsdom-patches',
        setup(build) {
            // Prefer a package's own CommonJS build where it ships one. An ES module build that loads
            // its data through createRequire(import.meta.url) (css-tree does) cannot work from inside
            // a bundle, where import.meta is empty
            build.onResolve({ filter: /^[^./]/ }, async args => {
                if (args.kind !== 'import-statement' || args.pluginData === 'cjs-retry') {
                    return undefined;
                }
                const resolved = await build.resolve(args.path, {
                    kind: 'require-call',
                    resolveDir: args.resolveDir,
                    importer: args.importer,
                    pluginData: 'cjs-retry'
                });
                return resolved.errors.length ? undefined : resolved;
            });

            for (const patch of PATCHES) {
                build.onLoad({ filter: patch.file }, args => {
                    const source = fs.readFileSync(args.path, 'utf8');
                    const matches = source.match(new RegExp(patch.pattern.source, 'g')) || [];
                    if (matches.length !== 1) {
                        throw new Error(`jsdom bundle: ${path.basename(args.path)} matches ${patch.pattern} ${matches.length} times, update the patch`);
                    }
                    applied.add(patch);
                    return { contents: source.replace(patch.pattern, () => patch.replacement(jsdomDir)), loader: 'js' };
                });
            }
        }
    };
}

// The package directory a bundled input belongs to, scoped names included
function packageDirOf(input) {
    const parts = input.split('/');
    const index = parts.lastIndexOf('node_modules');
    if (index === -1) {
        return null;
    }
    const nameParts = parts[index + 1].startsWith('@') ? 2 : 1;
    return parts.slice(0, index + 1 + nameParts).join('/');
}

function readLicenseText(dir) {
    const file = fs.readdirSync(dir).find(name => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(name));
    return file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : null;
}

function writeLicenses(root, metafile, outDir) {
    const packages = new Map();
    for (const input of Object.keys(metafile.inputs)) {
        const dir = packageDirOf(input);
        if (!dir || packages.has(dir)) {
            continue;
        }
        const manifest = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
        packages.set(dir, {
            name: manifest.name,
            version: manifest.version,
            license: manifest.license || null,
            licenseText: readLicenseText(path.join(root, dir))
        });
    }

    const list = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
    const missing = list.filter(entry => !entry.license);
    if (missing.length) {
        throw new Error(`jsdom bundle: no license declared by ${missing.map(entry => entry.name).join(', ')}`);
    }

    fs.writeFileSync(
        path.join(outDir, 'jsdom.packages.json'),
        JSON.stringify(
            list.map(({ name, version, license }) => ({ name, version, license })),
            null,
            4
        ) + '\n'
    );

    const text = list
        .map(entry => [`${entry.name}@${entry.version} (${entry.license})`, entry.licenseText || `Licensed under ${entry.license}.`].join('\n\n'))
        .join(SEPARATOR);
    fs.writeFileSync(path.join(outDir, 'jsdom.LICENSES.txt'), 'dist/vendor/jsdom.cjs bundles the following packages.' + SEPARATOR + text + '\n');
}

export async function bundleJsdom(root) {
    const outDir = path.join(root, 'dist', 'vendor');
    fs.mkdirSync(outDir, { recursive: true });
    const jsdomDir = path.dirname(require.resolve('jsdom/package.json', { paths: [root] }));

    const applied = new Set();
    const result = await esbuild.build({
        stdin: { contents: "module.exports = require('jsdom');", resolveDir: root, loader: 'js', sourcefile: 'jsdom-entry.cjs' },
        absWorkingDir: root,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        outfile: path.join(outDir, 'jsdom.cjs'),
        // canvas is an optional native peer that jsdom loads inside a try/catch; it is never installed
        external: ['canvas'],
        plugins: [jsdomPatches(jsdomDir, applied)],
        // Whitespace and syntax only: identifiers keep their names, which jsdom's interface classes
        // and stack traces read. It halves the source V8 keeps for lazy compilation in every
        // thread that loads the bundle. Licenses are written beside the bundle instead
        minifyWhitespace: true,
        minifySyntax: true,
        legalComments: 'none',
        metafile: true,
        logLevel: 'warning'
    });

    // A patch whose file was renamed or moved never reaches its onLoad hook at all
    const missed = PATCHES.filter(patch => !applied.has(patch));
    if (missed.length) {
        throw new Error(`jsdom bundle: no file matched ${missed.map(patch => patch.file).join(', ')}, update the patch`);
    }

    writeLicenses(root, result.metafile, outDir);
}
