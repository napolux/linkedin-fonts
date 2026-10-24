#!/usr/bin/env node
/**
 * Builds the extension for one or more browsers from the single source tree.
 *
 *   node scripts/build.mjs --target chrome|firefox|all [--watch]
 *
 * Output: dist/<target>/ containing manifest.json, content.js, icons/, LICENSE.
 * The output folder can be loaded unpacked in the browser or zipped with
 * `npm run package`. See DOCS/development.md.
 */
import { parseArgs } from 'node:util';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { watch as watchFs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';

import { buildManifest } from './lib/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

/** Per-browser settings. Add a new browser here plus src/manifest/<name>.json. */
const TARGETS = {
  chrome: { esbuildTarget: 'chrome120' },
  firefox: { esbuildTarget: 'firefox140' },
};

const { values: args } = parseArgs({
  options: {
    target: { type: 'string', default: 'all' },
    watch: { type: 'boolean', default: false },
  },
});

const targets = args.target === 'all' ? Object.keys(TARGETS) : [args.target];
for (const target of targets) {
  if (!TARGETS[target]) {
    console.error(`Unknown target "${target}". Use one of: ${Object.keys(TARGETS).join(', ')}, all.`);
    process.exit(1);
  }
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const pkg = await readJson(path.join(ROOT, 'package.json'));

const banner = `/*! ${pkg.name} v${pkg.version} | ${pkg.license} License | ${pkg.homepage} */`;

/** Writes dist/<target>/manifest.json from base.json + <target>.json. */
async function writeManifest(target) {
  const base = await readJson(path.join(SRC, 'manifest', 'base.json'));
  const override = await readJson(path.join(SRC, 'manifest', `${target}.json`));
  const manifest = buildManifest(base, override, pkg.version);
  await writeFile(
    path.join(DIST, target, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/** Copies the static files every build needs. */
async function copyStatic(target) {
  const out = path.join(DIST, target);
  await mkdir(path.join(out, 'icons'), { recursive: true });
  await cp(path.join(SRC, 'icons'), path.join(out, 'icons'), {
    recursive: true,
    filter: (source) => !source.endsWith('.svg'),
  });
  await cp(path.join(ROOT, 'LICENSE'), path.join(out, 'LICENSE'));
}

/** esbuild options for the content script of `target`. */
function esbuildOptions(target) {
  return {
    entryPoints: [path.join(SRC, 'content', 'index.js')],
    outfile: path.join(DIST, target, 'content.js'),
    bundle: true,
    // Content scripts declared in the manifest must be classic scripts.
    format: 'iife',
    target: TARGETS[target].esbuildTarget,
    // Release builds are minified to keep the extension small (store
    // reviewers get the original sources, see DOCS/releasing.md).
    // Watch builds stay readable for debugging.
    minify: !args.watch,
    sourcemap: args.watch ? 'inline' : false,
    banner: { js: banner },
    // toolbar.css is imported as a string and injected into the shadow root.
    loader: { '.css': 'text' },
    logLevel: 'warning',
  };
}

async function buildTarget(target) {
  await rm(path.join(DIST, target), { recursive: true, force: true });
  await mkdir(path.join(DIST, target), { recursive: true });
  await Promise.all([writeManifest(target), copyStatic(target)]);

  if (!args.watch) {
    await esbuild.build(esbuildOptions(target));
    console.log(`✔ ${target}: dist/${target}`);
    return;
  }

  const context = await esbuild.context({
    ...esbuildOptions(target),
    plugins: [
      {
        name: 'log-rebuilds',
        setup(build) {
          build.onEnd((result) => {
            const status = result.errors.length ? '✖' : '✔';
            console.log(`${status} ${target}: rebuilt at ${new Date().toLocaleTimeString()}`);
          });
        },
      },
    ],
  });
  await context.watch();
}

await Promise.all(targets.map(buildTarget));

if (args.watch) {
  // esbuild watches the JS/CSS graph; manifests and icons are watched here.
  const refresh = (folder) =>
    watchFs(path.join(SRC, folder), { recursive: true }, async () => {
      try {
        for (const target of targets) {
          await writeManifest(target);
          await copyStatic(target);
        }
        console.log(`✔ ${folder} refreshed`);
      } catch (error) {
        console.error(`✖ ${folder}: ${error.message}`);
      }
    });
  refresh('manifest');
  refresh('icons');
  console.log('Watching for changes… (Ctrl+C to stop)');
}
