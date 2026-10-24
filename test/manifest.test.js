import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deepMerge, buildManifest } from '../scripts/lib/manifest.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('deepMerge', () => {
  test('merges nested objects recursively', () => {
    assert.deepEqual(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } }), {
      a: { b: 1, c: 3, d: 4 },
    });
  });

  test('replaces arrays instead of concatenating them', () => {
    assert.deepEqual(deepMerge({ list: [1, 2] }, { list: [3] }), { list: [3] });
  });

  test('does not mutate its inputs', () => {
    const base = { a: { b: 1 } };
    const override = { a: { c: 2 } };
    deepMerge(base, override);
    assert.deepEqual(base, { a: { b: 1 } });
    assert.deepEqual(override, { a: { c: 2 } });
  });
});

describe('buildManifest', () => {
  test('injects the version', () => {
    assert.equal(buildManifest({ name: 'x' }, {}, '1.2.3').version, '1.2.3');
  });

  test('rejects versions browsers do not accept', () => {
    assert.throws(() => buildManifest({}, {}, '1.0.0-beta.1'), /Invalid extension version/);
  });
});

describe('shipped manifests', () => {
  const base = readJson('../src/manifest/base.json');
  const pkg = readJson('../package.json');

  for (const target of ['chrome', 'firefox']) {
    test(`${target}: MV3, LinkedIn only, no permissions`, () => {
      const manifest = buildManifest(base, readJson(`../src/manifest/${target}.json`), pkg.version);
      assert.equal(manifest.manifest_version, 3);
      assert.equal(manifest.permissions, undefined);
      assert.equal(manifest.host_permissions, undefined);
      assert.deepEqual(
        manifest.content_scripts.flatMap((cs) => cs.matches),
        ['https://www.linkedin.com/*'],
      );
    });
  }

  test('firefox: declares a gecko id and no data collection', () => {
    const manifest = buildManifest(base, readJson('../src/manifest/firefox.json'), pkg.version);
    const gecko = manifest.browser_specific_settings.gecko;
    assert.match(gecko.id, /@/);
    assert.deepEqual(gecko.data_collection_permissions, { required: ['none'] });
  });
});
