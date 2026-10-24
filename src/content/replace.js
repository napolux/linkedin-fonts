/**
 * Rewrites the selected text of a target (see editable.js) and selects the
 * result again, so further styles can be stacked on the same text.
 *
 * Text is changed with document.execCommand('insertText' / 'delete'). The
 * API is marked as deprecated but is still the only way to edit as if the
 * user had typed: browsers fire trusted `beforeinput`/`input` events, every
 * editor framework (Quill, React, Lexical, ProseMirror…) stays in sync, and
 * the change lands on the native undo stack (Ctrl/Cmd+Z works).
 * A plain DOM fallback is used only if the browser refuses the command.
 *
 * Only the part of the text that really changes is rewritten (see diff.js).
 */
import { minimalEdit } from './diff.js';
import { selectionFor } from './dom.js';
import { offsetToPoint, textSegments } from './offsets.js';

/**
 * Replaces the current selection with `text` the way typing would (an
 * empty `text` deletes the selection).
 * Calls `fallback` only if the browser did not even start the edit:
 * when an editor cancels `beforeinput` and applies the change itself,
 * execCommand may report failure even though the text was changed.
 */
function editSelection(text, fallback) {
  let started = false;
  const onBeforeInput = () => {
    started = true;
  };
  document.addEventListener('beforeinput', onBeforeInput, { capture: true, once: true });

  let succeeded;
  try {
    succeeded = text
      ? document.execCommand('insertText', false, text)
      : document.execCommand('delete', false);
  } catch {
    succeeded = false;
  } finally {
    document.removeEventListener('beforeinput', onBeforeInput, { capture: true });
  }

  if (!succeeded && !started) fallback();
}

/** Notifies frameworks of a change made behind their back. */
function dispatchInput(element, text) {
  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: text ? 'insertText' : 'deleteContentBackward',
      data: text || null,
    }),
  );
}

/** @param {import('./editable.js').ControlTarget} target */
function replaceInControl(target, transform) {
  const { element, start, end } = target;
  const original = element.value.slice(start, end);
  const replacement = transform(original);

  if (replacement !== original) {
    const edit = minimalEdit(original, replacement);
    const from = start + edit.from;
    const to = start + edit.to;
    element.focus();
    element.setSelectionRange(from, to);
    editSelection(edit.text, () => {
      element.setRangeText(edit.text, from, to, 'end');
      dispatchInput(element, edit.text);
    });
  }

  element.setSelectionRange(start, start + replacement.length);
}

/**
 * Selects the text between two text offsets of `root`.
 * A non-empty range hugs the text (start 'forward', end 'backward'). An empty
 * one (a caret for a pure insertion) is a single point, resolved with
 * `caretAffinity` so that it stays in the intended text node and does not
 * span a paragraph boundary.
 */
function selectOffsets(root, start, end, caretAffinity = 'backward') {
  const from = offsetToPoint(root, start, start === end ? caretAffinity : 'forward');
  const to = start === end ? from : offsetToPoint(root, end, 'backward');
  selectionFor(root).setBaseAndExtent(from.node, from.offset, to.node, to.offset);
}

/** @param {import('./editable.js').RichTarget} target */
function replaceInRichText(target, transform) {
  const { element: root, start, end } = target;
  let delta = 0;

  // Last to first: rewriting a segment never moves the ones before it.
  for (const segment of textSegments(root, start, end).reverse()) {
    const replacement = transform(segment.text);
    if (replacement === segment.text) continue;

    const edit = minimalEdit(segment.text, replacement);
    // A segment lies in one text node: an insertion point at its very start
    // belongs to that node ('forward'), anywhere else to the text before it.
    selectOffsets(
      root,
      segment.start + edit.from,
      segment.start + edit.to,
      edit.from === 0 ? 'forward' : 'backward',
    );
    editSelection(edit.text, () => {
      const selection = selectionFor(root);
      const range = selection.getRangeAt(0);
      range.deleteContents();
      if (edit.text) {
        const node = document.createTextNode(edit.text);
        range.insertNode(node);
        selection.collapse(node, node.length);
      }
      dispatchInput(root, edit.text);
    });
    delta += replacement.length - segment.text.length;
  }

  const newEnd = end + delta;
  selectOffsets(root, start, newEnd);
  // Editors that re-render asynchronously may move the caret after we are
  // done: select the result again once they have settled.
  requestAnimationFrame(() => {
    if (root.isConnected && root.contains(document.activeElement)) {
      selectOffsets(root, start, newEnd);
    }
  });
}

/**
 * Replaces the selected text of `target` with `transform(selectedText)` and
 * leaves the new text selected.
 *
 * @param {import('./editable.js').Target} target
 * @param {(text: string) => string} transform  Must not add or remove line breaks.
 */
export function replaceSelection(target, transform) {
  if (target.kind === 'control') replaceInControl(target, transform);
  else replaceInRichText(target, transform);
}
