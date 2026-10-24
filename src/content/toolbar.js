/**
 * The floating B / I / U toolbar.
 *
 * It lives in a closed shadow root, isolated from LinkedIn's styles and
 * scripts. It never takes focus: pressing a button must not clear the
 * selection the button is about to change.
 *
 * The host is a manual popover, shown in the browser's top layer. Modal
 * dialogs (LinkedIn's "Start a post", profile forms) also live there,
 * above any z-index, and make everything outside them inert. So the host is
 * attached inside the dialog or popover that contains the edited field
 * (see topLayerAncestor), and shown as a popover on top of it.
 */
import { composedParent } from './dom.js';
import css from './toolbar.css';

const BUTTONS = [
  { style: 'bold', label: 'Bold', glyph: 'B', key: 'B' },
  { style: 'italic', label: 'Italic', glyph: 'I', key: 'I' },
  { style: 'underline', label: 'Underline', glyph: 'U', key: 'U' },
];

const CAN = { bold: 'canBold', italic: 'canItalic', underline: 'canUnderline' };

/** Distance (px) from the selection and from the viewport edges. */
const GAP = 8;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * The closest open <dialog> or popover containing `element`, crossing
 * shadow roots, or null. The toolbar must live inside it to be visible and
 * clickable (and to not light-dismiss LinkedIn's own popovers).
 *
 * @param {Element} element
 * @returns {Element|null}
 */
export function topLayerAncestor(element) {
  for (let node = element; node; node = composedParent(node)) {
    if (node.matches('dialog[open], :popover-open')) return node;
  }
  return null;
}

export class Toolbar {
  #host;
  #shadow;
  #bar;
  #buttons = new Map();

  /**
   * @param {object} options
   * @param {(style: string) => void} options.onAction  Called when a button is pressed.
   * @param {boolean} options.isMac  Shows ⌘ instead of Ctrl in tooltips.
   */
  constructor({ onAction, isMac }) {
    // A custom tag name: page CSS written for div/span cannot match it.
    this.#host = document.createElement('linkedin-fonts-toolbar');
    this.#host.style.cssText = [
      'all: initial !important',
      'position: fixed !important',
      'top: 0 !important',
      'left: 0 !important',
      'width: 0 !important',
      'height: 0 !important',
      'z-index: 2147483647 !important',
    ].join(';');
    // Inline !important styles above override the UA popover styles
    // (border, padding, background, centering).
    this.#host.setAttribute('popover', 'manual');
    this.#shadow = this.#host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = css;

    this.#bar = document.createElement('div');
    this.#bar.className = 'toolbar';
    this.#bar.hidden = true;
    this.#bar.setAttribute('role', 'toolbar');
    this.#bar.setAttribute('aria-label', 'Text style');

    for (const { style: name, label, glyph, key } of BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.dataset.style = name;
      button.title = `${label} (${isMac ? `⌘${key}` : `Ctrl+${key}`})`;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-keyshortcuts', `${isMac ? 'Meta' : 'Control'}+${key}`);

      const glyphElement = document.createElement('span');
      glyphElement.className = `glyph-${name}`;
      glyphElement.textContent = glyph;
      button.append(glyphElement);

      this.#buttons.set(name, button);
      this.#bar.append(button);
    }

    // Cancelling mousedown keeps focus and selection in the editor.
    // (aria-disabled is used instead of `disabled` because disabled buttons
    // would not receive this event in every browser.)
    this.#bar.addEventListener('mousedown', (event) => event.preventDefault());
    this.#bar.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button && button.getAttribute('aria-disabled') !== 'true') {
        onAction(button.dataset.style);
      }
    });

    this.#shadow.append(style, this.#bar);
  }

  /** Whether the toolbar is currently shown. */
  get visible() {
    return !this.#bar.hidden;
  }

  /**
   * A node inside the shadow root where temporary measuring elements can go.
   * @param {Element} container  Where the toolbar lives (see show()).
   */
  scratchIn(container) {
    this.#attach(container);
    return this.#shadow;
  }

  /** Whether `event` happened on the toolbar. */
  isEventInside(event) {
    return event.composedPath().includes(this.#host);
  }

  /**
   * Shows the toolbar above the selection (below it if there is no room).
   *
   * @param {import('./position.js').Box} box  Selection box, viewport coordinates.
   * @param {ReturnType<import('./unicode.js').analyze>} state
   * @param {'light'|'dark'} theme
   * @param {Element} container  topLayerAncestor() of the field, or <html>.
   */
  show(box, state, theme, container) {
    this.#attach(container);
    this.#bar.dataset.theme = theme;
    for (const [name, button] of this.#buttons) {
      button.setAttribute('aria-pressed', String(state[name]));
      button.setAttribute('aria-disabled', String(!state[CAN[name]]));
    }
    this.#bar.hidden = false;

    const { offsetWidth: width, offsetHeight: height } = this.#bar;
    const above = box.top - height - GAP;
    const top = above >= GAP ? above : box.bottom + GAP;
    const left = (box.left + box.right) / 2 - width / 2;

    this.#bar.style.top = `${Math.round(clamp(top, GAP, window.innerHeight - height - GAP))}px`;
    this.#bar.style.left = `${Math.round(clamp(left, GAP, window.innerWidth - width - GAP))}px`;
  }

  hide() {
    // Called on every keystroke while typing: do nothing if already hidden.
    if (this.#bar.hidden) return;
    this.#bar.hidden = true;
    // Closing the popover means the next show() opens it again on top of
    // whatever entered the top layer in the meantime.
    if (this.#isOpen()) this.#host.hidePopover();
  }

  #isOpen() {
    return this.#host.matches(':popover-open');
  }

  /**
   * Puts the host in `container` (moving it if needed: single-page apps
   * also wipe foreign nodes) and opens it in the top layer.
   */
  #attach(container) {
    if (this.#host.parentNode !== container) container.append(this.#host);
    if (!this.#isOpen()) {
      try {
        this.#host.showPopover();
      } catch {
        // Not fatal: the toolbar still works outside of modal dialogs.
      }
    }
  }
}
