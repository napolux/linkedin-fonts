/**
 * Computes where the selection is on screen (viewport coordinates), so the
 * toolbar can be placed next to it.
 */

/**
 * @typedef {{top: number, bottom: number, left: number, right: number}} Box
 */

/**
 * CSS properties that influence text layout, copied to the mirror element
 * used to measure selections inside textarea/input elements.
 */
const MIRRORED_PROPERTIES = [
  'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
  'lineHeight', 'fontFamily', 'fontFeatureSettings', 'fontKerning',
  'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing',
  'tabSize', 'direction', 'writingMode',
];

/** Smallest box containing all `rects` (ignoring empty ones), or null. */
function union(rects) {
  let box = null;
  for (const rect of rects) {
    if (rect.width === 0 && rect.height === 0) continue;
    box = box
      ? {
          top: Math.min(box.top, rect.top),
          bottom: Math.max(box.bottom, rect.bottom),
          left: Math.min(box.left, rect.left),
          right: Math.max(box.right, rect.right),
        }
      : { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  }
  return box;
}

/** Intersection of two boxes, or null if they do not overlap. */
function intersect(a, b) {
  const box = {
    top: Math.max(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
  };
  return box.top <= box.bottom && box.left <= box.right ? box : null;
}

/**
 * Measures a textarea/input selection with the "mirror" technique: an
 * invisible element with the same box and font as the field, containing the
 * text before the selection and a <span> with the selection itself.
 *
 * @param {HTMLTextAreaElement|HTMLInputElement} element
 * @param {Node} scratch  Where the mirror is temporarily attached (our shadow root).
 * @returns {Box|null}
 */
function controlSelectionBox(element, scratch) {
  const fieldBox = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const isInput = element.localName === 'input';

  const mirror = document.createElement('div');
  for (const property of MIRRORED_PROPERTIES) mirror.style[property] = style[property];
  Object.assign(mirror.style, {
    position: 'fixed',
    top: `${fieldBox.top}px`,
    left: `${fieldBox.left}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
    overflow: 'hidden',
    whiteSpace: isInput ? 'pre' : 'pre-wrap',
    overflowWrap: isInput ? 'normal' : 'break-word',
  });

  const span = document.createElement('span');
  mirror.textContent = element.value.slice(0, element.selectionStart);
  span.textContent = element.value.slice(element.selectionStart, element.selectionEnd);
  mirror.append(span);
  scratch.append(mirror);
  mirror.scrollTop = element.scrollTop;
  mirror.scrollLeft = element.scrollLeft;

  let box = union(span.getClientRects());
  mirror.remove();
  if (!box) return null;

  // A single-line input centres its text vertically: use the field's edges.
  if (isInput) box = { ...box, top: fieldBox.top, bottom: fieldBox.bottom };
  // Keep only what is visible inside the field (it may be scrolled).
  return intersect(box, fieldBox);
}

/**
 * Returns the visible box of the target's selection, or null if it cannot be
 * measured or is scrolled out of the viewport.
 *
 * @param {import('./editable.js').Target} target
 * @param {Node} scratch  Container for temporary measuring elements.
 * @returns {Box|null}
 */
export function getSelectionBox(target, scratch) {
  const box =
    target.kind === 'control'
      ? controlSelectionBox(target.element, scratch)
      : union(target.range.getClientRects());
  if (!box) return null;

  const viewport = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  return intersect(box, viewport) ? box : null;
}
