import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { analyze, applyStyle, toggleStyle } from '../src/content/unicode.js';

const U = '\u0332'; // COMBINING LOW LINE

describe('bold', () => {
  test('converts ASCII letters to sans-serif bold', () => {
    assert.equal(applyStyle('Hello', 'bold', true), '𝗛𝗲𝗹𝗹𝗼');
  });

  test('converts digits to sans-serif bold digits', () => {
    assert.equal(applyStyle('2024', 'bold', true), '𝟮𝟬𝟮𝟰');
  });

  test('removes bold and restores the original text', () => {
    assert.equal(applyStyle('𝗛𝗲𝗹𝗹𝗼 𝟮𝟬𝟮𝟰', 'bold', false), 'Hello 2024');
  });

  test('leaves punctuation and spaces untouched', () => {
    assert.equal(applyStyle('Hi, you!', 'bold', true), '𝗛𝗶, 𝘆𝗼𝘂!');
  });

  test('is idempotent', () => {
    const once = applyStyle('Hello', 'bold', true);
    assert.equal(applyStyle(once, 'bold', true), once);
  });
});

describe('italic', () => {
  test('converts ASCII letters to sans-serif italic', () => {
    assert.equal(applyStyle('Hello', 'italic', true), '𝘏𝘦𝘭𝘭𝘰');
  });

  test('leaves digits untouched (Unicode has no italic digits)', () => {
    assert.equal(applyStyle('Year 2024', 'italic', true), '𝘠𝘦𝘢𝘳 2024');
  });

  test('removes italic', () => {
    assert.equal(applyStyle('𝘏𝘦𝘭𝘭𝘰', 'italic', false), 'Hello');
  });
});

describe('bold + italic combination', () => {
  test('italic on top of bold gives bold italic', () => {
    const bold = applyStyle('Hello', 'bold', true);
    assert.equal(applyStyle(bold, 'italic', true), '𝙃𝙚𝙡𝙡𝙤');
  });

  test('bold on top of italic gives bold italic', () => {
    const italic = applyStyle('Hello', 'italic', true);
    assert.equal(applyStyle(italic, 'bold', true), '𝙃𝙚𝙡𝙡𝙤');
  });

  test('removing bold from bold italic leaves italic', () => {
    assert.equal(applyStyle('𝙃𝙚𝙡𝙡𝙤', 'bold', false), '𝘏𝘦𝘭𝘭𝘰');
  });

  test('removing italic from bold italic leaves bold', () => {
    assert.equal(applyStyle('𝙃𝙚𝙡𝙡𝙤', 'italic', false), '𝗛𝗲𝗹𝗹𝗼');
  });

  test('bold italic digits fall back to bold digits', () => {
    const bold = applyStyle('A1', 'bold', true);
    assert.equal(applyStyle(bold, 'italic', true), '𝘼𝟭');
  });
});

describe('underline', () => {
  test('appends U+0332 to every character, spaces included', () => {
    assert.equal(applyStyle('a b', 'underline', true), `a${U} ${U}b${U}`);
  });

  test('does not underline line breaks', () => {
    assert.equal(applyStyle('a\nb', 'underline', true), `a${U}\nb${U}`);
  });

  test('does not underline emoji, keeping ZWJ sequences intact', () => {
    const family = '👨‍👩‍👧';
    assert.equal(applyStyle(`a${family}👍`, 'underline', true), `a${U}${family}👍`);
  });

  test('removes underline', () => {
    assert.equal(applyStyle(`a${U} ${U}b${U}`, 'underline', false), 'a b');
  });

  test('is idempotent (never doubles the combining mark)', () => {
    const once = applyStyle('ab', 'underline', true);
    assert.equal(applyStyle(once, 'underline', true), once);
  });

  test('combines with bold and survives bold removal', () => {
    const boldUnderlined = applyStyle(applyStyle('ab', 'bold', true), 'underline', true);
    assert.equal(boldUnderlined, `𝗮${U}𝗯${U}`);
    assert.equal(applyStyle(boldUnderlined, 'bold', false), `a${U}b${U}`);
  });

  test('underlines non-Latin scripts too', () => {
    assert.equal(applyStyle('да', 'underline', true), `д${U}а${U}`);
  });
});

describe('accented letters', () => {
  test('styles the base letter and keeps the accent as a combining mark', () => {
    assert.equal(applyStyle('è', 'bold', true), '𝗲\u0300');
    assert.equal(applyStyle('É', 'italic', true), '𝘌\u0301');
  });

  test('round-trips back to the precomposed (NFC) original', () => {
    const original = 'Perché è così? Ça va, señor Müller.';
    for (const style of ['bold', 'italic', 'underline']) {
      const styled = applyStyle(original, style, true);
      assert.notEqual(styled, original);
      assert.equal(applyStyle(styled, style, false), original, style);
    }
  });

  test('round-trips through every combination', () => {
    const original = 'àèìòù ÀÈÌÒÙ ñ ç ü';
    let text = original;
    text = applyStyle(text, 'bold', true);
    text = applyStyle(text, 'italic', true);
    text = applyStyle(text, 'underline', true);
    text = applyStyle(text, 'bold', false);
    text = applyStyle(text, 'underline', false);
    text = applyStyle(text, 'italic', false);
    assert.equal(text, original);
  });

  test('leaves letters without a decomposition untouched', () => {
    assert.equal(applyStyle('ßøæł', 'bold', true), 'ßøæł');
  });
});

describe('non-Latin text', () => {
  test('bold and italic leave other scripts untouched', () => {
    const text = 'Привет Γειά 你好 مرحبا';
    assert.equal(applyStyle(text, 'bold', true), text);
    assert.equal(applyStyle(text, 'italic', true), text);
  });

  test('untouched graphemes keep their exact code points', () => {
    const decomposedHangul = '한'.normalize('NFD');
    assert.equal(applyStyle(decomposedHangul, 'bold', true), decomposedHangul);
  });
});

describe('decoding text produced by other tools (serif variants)', () => {
  test('recognises serif bold, italic and bold italic', () => {
    assert.equal(applyStyle('𝐇𝐞𝐥𝐥𝐨', 'bold', false), 'Hello');
    assert.equal(applyStyle('𝐻𝑒𝑙𝑙𝑜', 'italic', false), 'Hello');
    assert.equal(applyStyle('𝑯𝒆𝒍𝒍𝒐', 'bold', false), '𝘏𝘦𝘭𝘭𝘰');
  });

  test('recognises the italic small h exception (U+210E)', () => {
    assert.equal(applyStyle('ℎ', 'italic', false), 'h');
    assert.equal(analyze('ℎ').italic, true);
  });

  test('recognises serif bold digits', () => {
    assert.equal(applyStyle('𝟐𝟎', 'bold', false), '20');
  });
});

describe('analyze', () => {
  test('reports the active styles of a uniformly styled selection', () => {
    assert.deepEqual(analyze('𝙃𝙚𝙮'), {
      bold: true,
      italic: true,
      underline: false,
      canBold: true,
      canItalic: true,
      canUnderline: true,
    });
  });

  test('a style is active only if every applicable character has it', () => {
    assert.equal(analyze('𝗛ello').bold, false);
    assert.equal(analyze('𝗛𝗲𝗹𝗹𝗼 𝟮𝟬').bold, true);
  });

  test('ignores characters the style cannot apply to', () => {
    assert.equal(analyze('𝗛𝗶! 你好').bold, true);
    assert.equal(analyze('𝘠𝘦𝘢𝘳 2024').italic, true);
  });

  test('ignores whitespace when deciding if the selection is underlined', () => {
    assert.equal(analyze(`a${U} b${U}`).underline, true);
  });

  test('reports what cannot be styled', () => {
    const result = analyze('👍 你好');
    assert.equal(result.canBold, false);
    assert.equal(result.canItalic, false);
    assert.equal(result.canUnderline, true);
    assert.equal(analyze('👍👍').canUnderline, false);
    assert.equal(analyze('123').canItalic, false);
  });

  test('handles the empty string', () => {
    assert.deepEqual(analyze(''), {
      bold: false,
      italic: false,
      underline: false,
      canBold: false,
      canItalic: false,
      canUnderline: false,
    });
  });
});

describe('toggleStyle', () => {
  test('adds a style when not every character has it', () => {
    assert.equal(toggleStyle('𝗛ello', 'bold'), '𝗛𝗲𝗹𝗹𝗼');
  });

  test('removes a style when every character has it', () => {
    assert.equal(toggleStyle('𝗛𝗲𝗹𝗹𝗼', 'bold'), 'Hello');
  });

  test('returns the text unchanged when the style cannot apply', () => {
    assert.equal(toggleStyle('你好', 'italic'), '你好');
  });

  test('rejects unknown styles', () => {
    assert.throws(() => toggleStyle('a', 'strike'), /Unknown style/);
  });
});
