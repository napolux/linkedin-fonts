/**
 * Computes the smallest edit that turns one string into another.
 *
 * Replacing only what actually changes keeps edits small: unchanged spaces
 * at the edges of a selection are not re-inserted, so browsers do not turn
 * them into non-breaking spaces, and the undo history stays minimal.
 */

const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code) => code >= 0xdc00 && code <= 0xdfff;

/**
 * @param {string} original
 * @param {string} replacement
 * @returns {{from: number, to: number, text: string}}
 *   Replace original.slice(from, to) with `text` to obtain `replacement`.
 *   Boundaries never fall inside a surrogate pair.
 */
export function minimalEdit(original, replacement) {
  const max = Math.min(original.length, replacement.length);

  let prefix = 0;
  while (prefix < max && original[prefix] === replacement[prefix]) prefix++;
  if (prefix > 0 && prefix < original.length && isHighSurrogate(original.charCodeAt(prefix - 1))) {
    prefix--;
  }

  let suffix = 0;
  while (
    suffix < max - prefix &&
    original[original.length - 1 - suffix] === replacement[replacement.length - 1 - suffix]
  ) {
    suffix++;
  }
  if (suffix > 0 && isLowSurrogate(original.charCodeAt(original.length - suffix))) {
    const before = original.length - suffix - 1;
    if (before >= prefix && isHighSurrogate(original.charCodeAt(before))) suffix--;
  }

  return {
    from: prefix,
    to: original.length - suffix,
    text: replacement.slice(prefix, replacement.length - suffix),
  };
}
