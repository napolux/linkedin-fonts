import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { minimalEdit } from '../src/content/diff.js';

/** Applies an edit, to check it really turns `original` into `replacement`. */
const apply = (original, { from, to, text }) => original.slice(0, from) + text + original.slice(to);

describe('minimalEdit', () => {
  test('keeps the unchanged prefix and suffix out of the edit', () => {
    const edit = minimalEdit(' for the help', ' 𝗳𝗼𝗿 the help');
    assert.deepEqual(edit, { from: 1, to: 4, text: '𝗳𝗼𝗿' });
  });

  test('never splits a surrogate pair at the start', () => {
    // 𝗮 (U+1D5EE) and 𝙖 (U+1D656) share the same high surrogate.
    const edit = minimalEdit('𝗮', '𝙖');
    assert.deepEqual(edit, { from: 0, to: 2, text: '𝙖' });
  });

  test('never splits a surrogate pair at the end', () => {
    // U+1D5EE is D835 DDEE and U+1F5EE is D83D DDEE: same low surrogate.
    assert.deepEqual(minimalEdit('\u{1D5EE}', '\u{1F5EE}'), { from: 0, to: 2, text: '\u{1F5EE}' });
  });

  test('handles pure deletions', () => {
    assert.deepEqual(minimalEdit('a\u0332', 'a'), { from: 1, to: 2, text: '' });
  });

  test('returns an empty edit for identical strings', () => {
    assert.deepEqual(minimalEdit('same', 'same'), { from: 4, to: 4, text: '' });
  });

  test('always produces the replacement', () => {
    const cases = [
      ['Hello world', '𝗛𝗲𝗹𝗹𝗼 𝘄𝗼𝗿𝗹𝗱'],
      ['𝗛𝗲𝗹𝗹𝗼', '𝙃𝙚𝙡𝙡𝙤'],
      ['a b', 'a\u0332 \u0332b\u0332'],
      ['aaa', 'aa'],
      ['', 'x'],
      ['x', ''],
    ];
    for (const [original, replacement] of cases) {
      assert.equal(apply(original, minimalEdit(original, replacement)), replacement);
    }
  });
});
