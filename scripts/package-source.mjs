#!/usr/bin/env node
/**
 * Creates artifacts/linkedin-fonts-source-<version>.zip from the committed
 * HEAD. addons.mozilla.org asks for the source code of bundled extensions;
 * upload this file together with the Firefox package (see DOCS/releasing.md).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const output = `artifacts/${pkg.name}-source-${pkg.version}.zip`;

const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.warn('⚠ Uncommitted changes are NOT included: the archive is built from HEAD.');
}

mkdirSync('artifacts', { recursive: true });
execFileSync('git', ['archive', '--format=zip', `--output=${output}`, 'HEAD'], { stdio: 'inherit' });
console.log(`✔ ${output}`);
