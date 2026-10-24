/**
 * The floating B / I / U toolbar.
 *
 * It lives in a closed shadow root attached to <html>, isolated from
 * LinkedIn's styles and scripts. It never takes focus: pressing a button
 * must not clear the selection the button is about to change.
 */
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

  /** A node inside the shadow root where temporary measuring elements can go. */
  get scratch() {
    this.#attach();
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
   */
  show(box, state, theme) {
    this.#attach();
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
    this.#bar.hidden = true;
  }

  /** (Re)attaches the host: single-page apps sometimes wipe foreign nodes. */
  #attach() {
    if (!this.#host.isConnected) document.documentElement.append(this.#host);
  }
}
