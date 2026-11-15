// Bundles jsdom and juice, each with everything it loads, into one CommonJS file apiece:
// dist/vendor/jsdom.cjs and dist/vendor/juice.cjs.
//
// jsdom is what DOMPurify sanitizes on, so its HTML parser (parse5) decides how hostile markup is
// read before it is cleaned, and juice inlines the stylesheets of a message. Both are ES module
// only (jsdom through parse5, @asamuzakjp/*, @exodus/bytes and tough-cookie, juice 12 itself). The
// CommonJS build has to stay loadable without require(esm), because EmailEngine bundles it into a
// binary with @yao-pkg/pkg, which cannot load ES modules. Rather than holding either on its last
// CommonJS release, the build turns them into real CommonJS here, so fixes keep arriving.
//
// Both are devDependencies for that reason: nothing at runtime resolves the packages themselves.
//
// juice is bundled through its `juice/client` entry, the juice() function without the file and URL
// inlining helpers (web-resource-inliner), which this library never calls.
//
// One jsdom internal does not survive bundling and is patched in place. The build fails when a
// patch did not apply, whether its pattern stopped matching or its file moved, rather than
// shipping a bundle that breaks at runtime:
// - the synchronous XMLHttpRequest worker is located with require.resolve() at load time. This
//   library never runs scripts or loads resources, so the path is replaced with null.
//
// The licenses of every bundled package are written to dist/vendor/<name>.LICENSES.txt and the
// package list to dist/vendor/<name>.packages.json, so a consumer's license listing can name them.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const SEPARATOR = '\n\n' + '-'.repeat(72) + '\n\n';

const BUNDLES = [
    {
        name: 'jsdom',
        entry: "module.exports = require('jsdom');",
        // canvas is an optional native peer that jsdom loads inside a try/catch; it is never installed
        external: ['canvas'],
        patches: [
            {
                file: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/,
                pattern: /require\.resolve\("\.\/xhr-sync-worker\.js"\)/,
                replacement: 'null'
            }
        ]
    },
    {
        name: 'juice',
        // juice/client is an ES module, its default export is the juice() function
        entry: "module.exports = require('juice/client').default;"
    }
];

function vendorPatches(bundle, applied) {
    return {
        name: `${bundle.name}-patches`,
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

            for (const patch of bundle.patches || []) {
                build.onLoad({ filter: patch.file }, args => {
                    const source = fs.readFileSync(args.path, 'utf8');
                    const matches = source.match(new RegExp(patch.pattern.source, 'g')) || [];
                    if (matches.length !== 1) {
                        throw new Error(
                            `${bundle.name} bundle: ${path.basename(args.path)} matches ${patch.pattern} ${matches.length} times, update the patch`
                        );
                    }
                    applied.add(patch);
                    return { contents: source.replace(patch.pattern, () => patch.replacement), loader: 'js' };
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

function writeLicenses(root, name, metafile, outDir) {
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
        throw new Error(`${name} bundle: no license declared by ${missing.map(entry => entry.name).join(', ')}`);
    }

    fs.writeFileSync(
        path.join(outDir, `${name}.packages.json`),
        JSON.stringify(
            list.map(({ name, version, license }) => ({ name, version, license })),
            null,
            4
        ) + '\n'
    );

    const text = list
        .map(entry => [`${entry.name}@${entry.version} (${entry.license})`, entry.licenseText || `Licensed under ${entry.license}.`].join('\n\n'))
        .join(SEPARATOR);
    fs.writeFileSync(path.join(outDir, `${name}.LICENSES.txt`), `dist/vendor/${name}.cjs bundles the following packages.` + SEPARATOR + text + '\n');
}

async function bundleOne(root, outDir, bundle) {
    const applied = new Set();
    const result = await esbuild.build({
        stdin: { contents: bundle.entry, resolveDir: root, loader: 'js', sourcefile: `${bundle.name}-entry.cjs` },
        absWorkingDir: root,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node22',
        outfile: path.join(outDir, `${bundle.name}.cjs`),
        external: bundle.external || [],
        plugins: [vendorPatches(bundle, applied)],
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
    const missed = (bundle.patches || []).filter(patch => !applied.has(patch));
    if (missed.length) {
        throw new Error(`${bundle.name} bundle: no file matched ${missed.map(patch => patch.file).join(', ')}, update the patch`);
    }

    writeLicenses(root, bundle.name, result.metafile, outDir);
}

export async function bundleVendor(root) {
    const outDir = path.join(root, 'dist', 'vendor');
    fs.mkdirSync(outDir, { recursive: true });
    await Promise.all(BUNDLES.map(bundle => bundleOne(root, outDir, bundle)));
}
