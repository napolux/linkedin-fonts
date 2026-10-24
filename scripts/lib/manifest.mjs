/**
 * Helpers to generate a browser-specific manifest.json from
 * src/manifest/base.json plus a per-browser override file.
 */

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Recursively merges `override` into `base` and returns a new object.
 * Nested objects are merged; arrays and primitives in `override` win.
 */
export function deepMerge(base, override) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] =
      isPlainObject(value) && isPlainObject(result[key])
        ? deepMerge(result[key], value)
        : structuredClone(value);
  }
  return result;
}

// Chrome and Firefox both accept 1 to 4 dot-separated integers, no pre-release tags.
const VERSION = /^\d+(\.\d+){0,3}$/;

/**
 * @param {object} base      Shared manifest fields.
 * @param {object} override  Browser-specific fields.
 * @param {string} version   Usually package.json "version".
 */
export function buildManifest(base, override, version) {
  if (!VERSION.test(version)) {
    throw new Error(`Invalid extension version "${version}": use 1-4 dot-separated integers.`);
  }
  return { ...deepMerge(base, override), version };
}
