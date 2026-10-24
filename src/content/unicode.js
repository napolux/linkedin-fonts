/**
 * Pure Unicode styling logic: no DOM access, fully unit-testable in Node.
 *
 * LinkedIn has no rich text, so "bold" and "italic" are emulated with the
 * Mathematical Alphanumeric Symbols block (U+1D400–U+1D7FF), and "underline"
 * with the COMBINING LOW LINE (U+0332) appended to each character.
 *
 * Text is processed one grapheme (user-perceived character) at a time. Each
 * grapheme is parsed into a small model:
 *
 *   { base, bold, italic, underline, marks }
 *
 * where `base` is the plain ASCII letter/digit (or null when the grapheme
 * cannot be styled) and `marks` are the remaining combining marks (accents).
 * Accented letters are handled by decomposing them (NFD): the base letter is
 * styled and the accent is kept as a combining mark, e.g. "è" -> "𝗲" + U+0300.
 *
 * See DOCS/unicode.md for the full mapping tables and design notes.
 */

/** The three supported styles. */
export const STYLES = Object.freeze(['bold', 'italic', 'underline']);

const UNDERLINE_MARK = '\u0332';

/**
 * First code point of each 26-letter (or 10-digit) run. The extension always
 * writes the sans-serif variants, which blend with LinkedIn's UI font.
 */
const SANS = {
  bold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
  italic: { upper: 0x1d608, lower: 0x1d622 },
  boldItalic: { upper: 0x1d63c, lower: 0x1d656 },
};

/**
 * Serif variants, only ever *read*: text styled by other tools can still be
 * detected and un-styled by the extension.
 */
const SERIF = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  italic: { upper: 0x1d434, lower: 0x1d44e },
  boldItalic: { upper: 0x1d468, lower: 0x1d482 },
};

/**
 * Holes in the Mathematical Alphanumeric Symbols block: these characters
 * already existed elsewhere in Unicode when the block was created.
 * Serif italic small h (U+1D455) is reserved; PLANCK CONSTANT is used instead.
 */
const SERIF_ITALIC_EXCEPTIONS = { h: 0x210e };

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

/**
 * Reverse lookup: styled (or plain) character -> { base, bold, italic }.
 * @type {Map<string, {base: string, bold: boolean, italic: boolean}>}
 */
const DECODE = buildDecodeTable();

function buildDecodeTable() {
  const table = new Map();
  const add = (char, base, bold, italic) => table.set(char, { base, bold, italic });

  for (const base of UPPER + LOWER + DIGITS) add(base, base, false, false);

  for (const family of [SERIF, SANS]) {
    for (const [variant, bold, italic] of [
      ['bold', true, false],
      ['italic', false, true],
      ['boldItalic', true, true],
    ]) {
      const ranges = family[variant];
      [...UPPER].forEach((base, i) => add(String.fromCodePoint(ranges.upper + i), base, bold, italic));
      [...LOWER].forEach((base, i) => add(String.fromCodePoint(ranges.lower + i), base, bold, italic));
      if (ranges.digit) {
        [...DIGITS].forEach((base, i) => add(String.fromCodePoint(ranges.digit + i), base, true, false));
      }
    }
  }

  for (const [base, codePoint] of Object.entries(SERIF_ITALIC_EXCEPTIONS)) {
    add(String.fromCodePoint(codePoint), base, false, true);
  }

  return table;
}

/**
 * Returns the character for `base` (ASCII letter or digit) in the requested
 * style, using the sans-serif family. Digits have no italic form, so italic
 * is ignored for them.
 */
function encode(base, bold, italic) {
  if (DIGITS.includes(base)) {
    return bold ? String.fromCodePoint(SANS.bold.digit + DIGITS.indexOf(base)) : base;
  }
  if (!bold && !italic) return base;

  const ranges = SANS[bold && italic ? 'boldItalic' : bold ? 'bold' : 'italic'];
  const upperIndex = UPPER.indexOf(base);
  return upperIndex >= 0
    ? String.fromCodePoint(ranges.upper + upperIndex)
    : String.fromCodePoint(ranges.lower + LOWER.indexOf(base));
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const LINE_BREAK = /^(?:\r\n|[\n\r\v\f\u0085\u2028\u2029])$/;
const WHITESPACE = /^\s+$/u;
const COMBINING_MARK = /^\p{M}$/u;
// Emoji rendered as pictures: underlining them looks broken, so they are skipped.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|\p{Regional_Indicator}/u;

/**
 * @typedef {object} Grapheme
 * @property {string} source       Original grapheme, returned as-is when unchanged.
 * @property {string} head         First code point (after NFD), '' for orphan marks.
 * @property {string|null} base    Plain letter/digit, or null if not stylable.
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {string} marks        Combining marks other than the underline.
 * @property {boolean} canBold
 * @property {boolean} canItalic
 * @property {boolean} canUnderline
 * @property {boolean} isWhitespace
 */

/** @returns {Grapheme} */
function parseGrapheme(source) {
  const codePoints = [...source.normalize('NFD')];
  let head = codePoints[0];
  let tail = codePoints.slice(1);
  if (COMBINING_MARK.test(head)) {
    // Orphan marks, e.g. a selection that starts right after a base letter.
    tail = codePoints;
    head = '';
  }

  const underline = tail.includes(UNDERLINE_MARK);
  const marks = tail.filter((cp) => cp !== UNDERLINE_MARK).join('');
  const decoded = DECODE.get(head);
  const isLineBreak = LINE_BREAK.test(source);

  return {
    source,
    head,
    base: decoded ? decoded.base : null,
    bold: decoded ? decoded.bold : false,
    italic: decoded ? decoded.italic : false,
    underline,
    marks,
    canBold: Boolean(decoded),
    canItalic: Boolean(decoded) && !DIGITS.includes(decoded.base),
    canUnderline: !isLineBreak && !EMOJI.test(source),
    isWhitespace: !isLineBreak && WHITESPACE.test(head),
  };
}

/** @param {Grapheme} g */
function renderGrapheme(g) {
  const head = g.base === null ? g.head : encode(g.base, g.bold, g.italic);
  return (head + g.marks + (g.underline ? UNDERLINE_MARK : '')).normalize('NFC');
}

function parse(text) {
  return Array.from(segmenter.segment(text), ({ segment }) => parseGrapheme(segment));
}

function assertStyle(style) {
  if (!STYLES.includes(style)) throw new TypeError(`Unknown style: ${style}`);
}

const CAN = { bold: 'canBold', italic: 'canItalic', underline: 'canUnderline' };

/**
 * Describes the styles of `text`, used to render the toolbar button states
 * and to decide whether a click adds or removes a style.
 *
 * A style is reported as active only if *every* character it can apply to
 * already has it. Whitespace is ignored for underline (unless the text is
 * only whitespace), so "a̲ b̲" counts as underlined.
 *
 * @param {string} text
 * @returns {{bold: boolean, italic: boolean, underline: boolean,
 *            canBold: boolean, canItalic: boolean, canUnderline: boolean}}
 */
export function analyze(text) {
  const graphemes = parse(text);
  const result = {};

  for (const style of STYLES) {
    let applicable = graphemes.filter((g) => g[CAN[style]]);
    if (style === 'underline' && applicable.some((g) => !g.isWhitespace)) {
      applicable = applicable.filter((g) => !g.isWhitespace);
    }
    result[style] = applicable.length > 0 && applicable.every((g) => g[style]);
    result[CAN[style]] = applicable.length > 0;
  }

  return {
    bold: result.bold,
    italic: result.italic,
    underline: result.underline,
    canBold: result.canBold,
    canItalic: result.canItalic,
    canUnderline: result.canUnderline,
  };
}

/**
 * Sets (`enabled = true`) or clears (`enabled = false`) a style on every
 * character of `text` it can apply to, preserving the other styles.
 * Characters that are not affected keep their exact original code points.
 *
 * Being explicit (rather than a toggle) makes it safe to apply to several
 * pieces of one selection independently, e.g. one per DOM text node.
 *
 * @param {string} text
 * @param {'bold'|'italic'|'underline'} style
 * @param {boolean} enabled
 * @returns {string}
 */
export function applyStyle(text, style, enabled) {
  assertStyle(style);
  let output = '';
  for (const g of parse(text)) {
    if (!g[CAN[style]] || g[style] === enabled) {
      output += g.source;
    } else {
      output += renderGrapheme({ ...g, [style]: enabled });
    }
  }
  return output;
}

/**
 * Adds `style` to `text` unless all of it already has it, in which case the
 * style is removed. This is what a toolbar button does.
 *
 * @param {string} text
 * @param {'bold'|'italic'|'underline'} style
 * @returns {string}
 */
export function toggleStyle(text, style) {
  assertStyle(style);
  return applyStyle(text, style, !analyze(text)[style]);
}
