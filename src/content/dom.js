/**
 * Small DOM helpers that work across (open) shadow roots.
 * LinkedIn renders some editors, like the chat overlay, inside shadow DOM.
 */

/**
 * The parent of `node` in the composed tree: its parent element, or the
 * shadow host when `node` is the top element of a shadow root.
 *
 * @param {Node} node
 * @returns {Element|null}
 */
export function composedParent(node) {
  return node.parentElement ?? node.getRootNode().host ?? null;
}

/**
 * The selection as seen from the tree that contains `node`.
 *
 * Chrome hides selections inside a shadow root from document.getSelection():
 * it reports a collapsed selection on the shadow host's parent instead. The
 * real one is only available from the (non-standard) ShadowRoot.getSelection().
 * Firefox has no such method, and its document.getSelection() already
 * returns the nodes inside the shadow root.
 *
 * @param {Node} node
 * @returns {Selection}
 */
export function selectionFor(node) {
  const root = node.getRootNode();
  return typeof root.getSelection === 'function' && root !== document
    ? root.getSelection()
    : document.getSelection();
}
