/**
 * Helpers shared by the end-to-end tests and scripts/screenshots.mjs.
 */

/**
 * Installed in the page as `window.e2e`. Serialized with toString(), so it
 * must not reference anything outside its own body.
 */
export function pageHelpers() {
  const settle = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))));
  const isControl = (element) => element.localName === 'textarea' || element.localName === 'input';
  /** document.querySelector, plus "host >>> inner" to reach into an open shadow root. */
  const find = (selector) => {
    const [host, inner] = selector.split(' >>> ');
    return inner ? document.querySelector(host).shadowRoot.querySelector(inner) : document.querySelector(host);
  };
  /** The focused element, inside open shadow roots too. */
  const deepActive = () => {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
  };

  window.e2e = {
    settle,

    /** Selects from the first `from` to the end of the following `to`. */
    async select(selector, from, to = from) {
      const element = find(selector);
      element.focus();
      if (isControl(element)) {
        const start = element.value.indexOf(from);
        element.setSelectionRange(start, element.value.indexOf(to, start) + to.length);
      } else {
        const nodes = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) nodes.push(walker.currentNode);
        const text = nodes.map((node) => node.data).join('');
        const start = text.indexOf(from);
        const end = text.indexOf(to, start) + to.length;
        const point = (offset, isEnd) => {
          let total = 0;
          for (const node of nodes) {
            const next = total + node.data.length;
            if (offset < next || (isEnd && offset === next)) return [node, offset - total];
            total = next;
          }
          throw new Error(`Offset ${offset} not found`);
        };
        document.getSelection().setBaseAndExtent(...point(start, false), ...point(end, true));
      }
      await settle();
    },

    /**
     * Viewport points just inside the first character of `from` and the last
     * character of `to`, to select that text by dragging the real mouse.
     */
    dragPoints(selector, from, to = from) {
      const element = find(selector);
      element.scrollIntoView({ block: 'center' });
      const nodes = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
      const text = nodes.map((node) => node.data).join('');
      const charBox = (offset) => {
        let total = 0;
        for (const node of nodes) {
          if (offset < total + node.data.length) {
            const range = document.createRange();
            range.setStart(node, offset - total);
            range.setEnd(node, offset - total + 1);
            return range.getBoundingClientRect();
          }
          total += node.data.length;
        }
        throw new Error(`Offset ${offset} not found`);
      };
      const start = text.indexOf(from);
      const first = charBox(start);
      const last = charBox(text.indexOf(to, start) + to.length - 1);
      return [first.left + 1, first.top + first.height / 2, last.right - 1, last.top + last.height / 2];
    },

    async collapse(selector) {
      const element = find(selector);
      if (isControl(element)) element.setSelectionRange(0, 0);
      else document.getSelection().collapse(element, 0);
      await settle();
    },

    selected() {
      const element = deepActive();
      if (isControl(element)) return element.value.slice(element.selectionStart, element.selectionEnd);
      // Chrome hides selections inside shadow DOM from document.getSelection().
      const root = element.getRootNode();
      return (root.getSelection?.() ?? document.getSelection()).toString();
    },

    /** Textarea/input value, or the text of each <p> of a rich editor. */
    value(selector) {
      const element = find(selector);
      return isControl(element) ? element.value : [...element.querySelectorAll('p')].map((p) => p.textContent);
    },

    /**
     * Records whether the next keydowns were cancelled. Registered after the
     * extension's own capture listener, so it sees the extension's decision.
     */
    trackKeys() {
      window.e2e.keyPrevented = null;
      window.addEventListener('keydown', (event) => {
        window.e2e.keyPrevented = event.defaultPrevented;
      }, true);
    },

    lastKeyPrevented() {
      return window.e2e.keyPrevented;
    },

    selectionTop() {
      return document.getSelection().getRangeAt(0).getBoundingClientRect().top;
    },

    /**
     * The toolbar's bounding box, or null when hidden. Its shadow root is
     * closed, so it is located by probing the viewport with elementFromPoint.
     */
    toolbar() {
      let box = null;
      for (let y = 0; y < innerHeight; y += 4) {
        for (let x = 0; x < innerWidth; x += 4) {
          if (document.elementFromPoint(x, y)?.localName !== 'linkedin-fonts-toolbar') continue;
          box = box
            ? {
                left: Math.min(box.left, x),
                top: Math.min(box.top, y),
                right: Math.max(box.right, x),
                bottom: Math.max(box.bottom, y),
              }
            : { left: x, top: y, right: x, bottom: y };
        }
      }
      return box;
    },
  };
}

/** Center of a button inside the toolbar box (three equal columns). */
export function buttonCenter(box, style) {
  const column = { bold: 1, italic: 3, underline: 5 }[style];
  return [box.left + ((box.right - box.left) * column) / 6, (box.top + box.bottom) / 2];
}
