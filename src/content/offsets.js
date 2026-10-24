/**
 * A "text offset" model for contenteditable editors.
 *
 * Rich editors (Quill, React-based editors, plain contenteditable) freely
 * split, merge and re-create DOM nodes while you edit, so DOM references
 * held across an edit are unreliable. Instead, a position is expressed as a
 * single integer: the number of UTF-16 code units of text that precede it
 * inside the editing host (the concatenation of all its text nodes, in
 * document order). Block boundaries (<p>, <br>) contribute nothing.
 *
 * Positions survive edits that do not change the text *before* them, which
 * is why replace.js applies changes from the last segment to the first.
 */

/** Yields the text nodes under `root` in document order. */
function* textNodes(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) yield node;
}

/**
 * Whether a text node can be edited. Text inside a contenteditable="false"
 * island (e.g. a mention chip) is skipped so it is never rewritten.
 */
function isEditableText(node) {
  return node.parentElement?.isContentEditable === true;
}

/**
 * Whether a text node is whitespace the browser does not render, such as
 * the indentation between two <p> elements. Underlining it would turn
 * invisible formatting into visible underscores.
 */
function isCollapsedWhitespace(node) {
  if (/\S/.test(node.data)) return false;
  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects()).every((rect) => rect.width === 0);
}

/**
 * Converts a DOM boundary point (as found in a Range) to a text offset.
 *
 * @param {Element} root     Editing host.
 * @param {Node} container   Range start/end container.
 * @param {number} offset    Range start/end offset.
 * @returns {number}
 */
export function pointToOffset(root, container, offset) {
  const point = root.ownerDocument.createRange();
  point.setStart(container, offset);

  let total = 0;
  for (const node of textNodes(root)) {
    if (node === container) return total + offset;
    // The point sits between elements: stop at the first text node after it.
    if (point.comparePoint(node, 0) >= 0) return total;
    total += node.data.length;
  }
  return total;
}

/**
 * Converts a text offset back to a DOM boundary point.
 *
 * At the boundary between two text nodes the same offset matches both the
 * end of the first and the start of the second: `affinity` picks one.
 * Use 'forward' for the start of a selection and 'backward' for its end, so
 * the selection hugs the selected text.
 *
 * @param {Element} root
 * @param {number} target
 * @param {'forward'|'backward'} [affinity]
 * @returns {{node: Node, offset: number}}
 */
export function offsetToPoint(root, target, affinity = 'forward') {
  let total = 0;
  let last = null;
  for (const node of textNodes(root)) {
    const end = total + node.data.length;
    if (target < end || (target === end && affinity === 'backward' && node.data.length > 0)) {
      return { node, offset: Math.max(0, target - total) };
    }
    total = end;
    last = node;
  }
  return last
    ? { node: last, offset: last.data.length }
    : { node: root, offset: root.childNodes.length };
}

/**
 * Splits the text range [start, end) into the pieces that can be rewritten:
 * one per editable, rendered text node, and inside each node one per line
 * (line breaks are never sent to the editor, since inserting them would
 * create new paragraphs).
 *
 * @param {Element} root
 * @param {number} start
 * @param {number} end
 * @returns {Array<{start: number, end: number, text: string}>}
 */
export function textSegments(root, start, end) {
  const segments = [];
  let total = 0;
  for (const node of textNodes(root)) {
    const nodeStart = total;
    total += node.data.length;
    const from = Math.max(start, nodeStart);
    const to = Math.min(end, total);
    if (from >= to || !isEditableText(node) || isCollapsedWhitespace(node)) continue;

    const text = node.data.slice(from - nodeStart, to - nodeStart);
    for (const match of text.matchAll(/[^\r\n\p{Zl}\p{Zp}]+/gu)) {
      segments.push({
        start: from + match.index,
        end: from + match.index + match[0].length,
        text: match[0],
      });
    }
  }
  return segments;
}
