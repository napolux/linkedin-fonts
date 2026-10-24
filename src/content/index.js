/**
 * Content script entry point, injected in every www.linkedin.com page.
 *
 * Wires browser events to the toolbar:
 *   selection changes ─▶ getActiveTarget() ─▶ analyze() ─▶ toolbar.show()/hide()
 *   button or shortcut ─▶ applyStyle() via replaceSelection() ─▶ refresh
 *
 * The toolbar stays visible as long as there is a non-empty selection in a
 * focused LinkedIn field, so styles can be stacked (e.g. bold + italic).
 * See DOCS/architecture.md.
 */
import { analyze, applyStyle } from './unicode.js';
import { getActiveTarget } from './editable.js';
import { replaceSelection } from './replace.js';
import { getSelectionBox } from './position.js';
import { detectTheme } from './theme.js';
import { Toolbar, topLayerAncestor } from './toolbar.js';

// Chromium reports "macOS" (or an empty string) in userAgentData,
// Firefox only has navigator.platform ("MacIntel"): match case-insensitively.
const IS_MAC = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform);

/** Ctrl/Cmd + key shortcuts. `event.key` respects the keyboard layout… */
const SHORTCUT_KEYS = { b: 'bold', i: 'italic', u: 'underline' };
/** …and `event.code` (physical key) covers non-Latin layouts. */
const SHORTCUT_CODES = { KeyB: 'bold', KeyI: 'italic', KeyU: 'underline' };

function start() {
  const toolbar = new Toolbar({
    isMac: IS_MAC,
    onAction: (style) => {
      const target = getActiveTarget();
      if (target) toggle(target, style);
    },
  });

  let pointerDown = false;
  let frame = 0;
  let theme = 'light';
  let themeElement = null;

  /** Adds `style` to the selection, or removes it if all of it has it. */
  function toggle(target, style) {
    const enabled = !analyze(target.text)[style];
    replaceSelection(target, (text) => applyStyle(text, style, enabled));
    scheduleRefresh();
  }

  /** Shows, moves, updates or hides the toolbar to match the selection. */
  function refresh() {
    frame = 0;
    // While the mouse is selecting, wait for the button to be released.
    if (pointerDown) return;

    const target = getActiveTarget();
    if (!target) {
      toolbar.hide();
      return;
    }

    // Fields in a modal dialog or popover (top layer) get the toolbar inside it.
    const container = topLayerAncestor(target.element) ?? document.documentElement;
    const box = getSelectionBox(target, toolbar.scratchIn(container));
    if (!box) {
      toolbar.hide();
      return;
    }

    // The theme only needs checking when the toolbar appears or moves to another field.
    if (!toolbar.visible || themeElement !== target.element) {
      theme = detectTheme(target.element);
      themeElement = target.element;
    }
    toolbar.show(box, analyze(target.text), theme, container);
  }

  /** Batches bursts of events (selectionchange, scroll…) into one refresh per frame. */
  function scheduleRefresh() {
    frame ||= requestAnimationFrame(refresh);
  }

  function onPointerDown(event) {
    if (toolbar.isEventInside(event)) return;
    pointerDown = true;
    toolbar.hide();
  }

  /**
   * keyup only matters for keyboard selections (Shift + arrows…) or to
   * update a visible toolbar; plain typing is covered by selectionchange.
   */
  function onKeyUp(event) {
    if (event.shiftKey || toolbar.visible) scheduleRefresh();
  }

  function onPointerUp() {
    pointerDown = false;
    scheduleRefresh();
  }

  function onKeyDown(event) {
    if (event.isComposing || event.altKey || event.shiftKey) return;
    const modifier = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!modifier) return;

    const key = event.key.length === 1 ? event.key.toLowerCase() : '';
    const style = /^[a-z]$/.test(key) ? SHORTCUT_KEYS[key] : SHORTCUT_CODES[event.code];
    if (!style) return;

    // Without a selection in a supported field the shortcut is left alone.
    const target = getActiveTarget();
    if (!target) return;

    // Stop the browser (bookmarks, page info, view source) and the page
    // (native contenteditable bold) from handling it as well.
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) toggle(target, style);
  }

  const capture = { capture: true };
  const passiveCapture = { capture: true, passive: true };

  document.addEventListener('selectionchange', scheduleRefresh, capture);
  document.addEventListener('select', scheduleRefresh, capture);
  document.addEventListener('focusin', scheduleRefresh, capture);
  document.addEventListener('focusout', scheduleRefresh, capture);
  document.addEventListener('keyup', onKeyUp, capture);
  window.addEventListener('keydown', onKeyDown, capture);
  window.addEventListener('pointerdown', onPointerDown, passiveCapture);
  window.addEventListener('pointerup', onPointerUp, passiveCapture);
  window.addEventListener('pointercancel', onPointerUp, passiveCapture);
  window.addEventListener('blur', onPointerUp);
  window.addEventListener('scroll', scheduleRefresh, passiveCapture);
  window.addEventListener('resize', scheduleRefresh, { passive: true });
}

// Guard against a second injection in the same page (e.g. a dev reload).
const LOADED = Symbol.for('linkedin-fonts.loaded');
if (!globalThis[LOADED]) {
  globalThis[LOADED] = true;
  start();
}
