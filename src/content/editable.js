/**
 * Finds out whether the user has selected text in a field the extension
 * supports, and describes that selection as a "target".
 *
 * Two kinds of fields exist on LinkedIn:
 * - text controls: <textarea> and <input type="text"> (headline, About…);
 * - rich editors: any contenteditable element (posts, comments, messages).
 *
 * Detection is generic on purpose: it does not depend on LinkedIn's class
 * names, which change often.
 */
import { pointToOffset, textSegments } from './offsets.js';

/**
 * @typedef {object} ControlTarget
 * @property {'control'} kind
 * @property {HTMLTextAreaElement|HTMLInputElement} element
 * @property {number} start   selectionStart
 * @property {number} end     selectionEnd
 * @property {string} text    Selected text.
 *
 * @typedef {object} RichTarget
 * @property {'rich'} kind
 * @property {HTMLElement} element  Editing host (outermost contenteditable).
 * @property {Range} range          The live selection range.
 * @property {number} start         Text offset of the selection start.
 * @property {number} end           Text offset of the selection end.
 * @property {string} text          Editable selected text, one line per segment.
 *
 * @typedef {ControlTarget|RichTarget} Target
 */

/** The focused element, looking inside open shadow roots. */
function deepActiveElement() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

/** Whether `element` is a writable textarea or single-line text input. */
function isTextControl(element) {
  if (element.readOnly || element.disabled) return false;
  if (element.localName === 'textarea') return true;
  // Search boxes with suggestions (role="combobox") are not content fields.
  return (
    element.localName === 'input' &&
    element.type === 'text' &&
    element.getAttribute('role') !== 'combobox'
  );
}

/** The outermost contenteditable ancestor of `node`, or null. */
function editingHost(node) {
  let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element?.isContentEditable) return null;
  while (element.parentElement?.isContentEditable) element = element.parentElement;
  return element;
}

/** @returns {ControlTarget|null} */
function controlTarget(element) {
  const { selectionStart: start, selectionEnd: end } = element;
  if (start === null || start === end) return null;
  return { kind: 'control', element, start, end, text: element.value.slice(start, end) };
}

/** @returns {RichTarget|null} */
function richTarget(active) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const host = editingHost(range.startContainer);
  if (!host || host !== editingHost(range.endContainer)) return null;
  // The editor must have focus: a stale selection left behind after the
  // user clicked elsewhere does not count.
  if (!active || !host.contains(active)) return null;

  const start = pointToOffset(host, range.startContainer, range.startOffset);
  const end = pointToOffset(host, range.endContainer, range.endOffset);
  const text = textSegments(host, start, end)
    .map((segment) => segment.text)
    .join('\n');
  if (!text) return null;

  return { kind: 'rich', element: host, range, start, end, text };
}

/**
 * Describes the current selection if it is a non-empty selection inside a
 * supported, focused field.
 *
 * @returns {Target|null}
 */
export function getActiveTarget() {
  const active = deepActiveElement();
  if (active && (active.localName === 'textarea' || active.localName === 'input')) {
    return isTextControl(active) ? controlTarget(active) : null;
  }
  return richTarget(active);
}
