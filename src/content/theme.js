/**
 * Picks the toolbar theme by looking at the page, not at LinkedIn's CSS
 * classes: LinkedIn has its own dark mode setting, independent from the
 * operating system, and its markup changes often.
 *
 * The first opaque background found walking up from the edited field
 * decides: dark backgrounds get the dark toolbar. If every ancestor is
 * transparent, the operating system preference is used.
 */

import { composedParent } from './dom.js';

/** Relative luminance threshold (WCAG formula, 0 = black, 1 = white). */
const DARK_LUMINANCE = 0.35;

let canvasContext = null;

/**
 * Parses any CSS color into [r, g, b, a] (0-255, 0-1).
 * Computed colors are usually rgb()/rgba(), but modern browsers keep other
 * color spaces (oklch(), color()…) as authored: a 1×1 canvas converts those.
 */
function parseColor(value) {
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (match) {
    const alpha = match[4] === undefined ? 1 : parseFloat(match[4]) / (match[4].endsWith('%') ? 100 : 1);
    return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
  }

  canvasContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!canvasContext) return null;
  canvasContext.clearRect(0, 0, 1, 1);
  canvasContext.fillStyle = value;
  canvasContext.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvasContext.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

function luminance([r, g, b]) {
  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * @param {Element} element  The edited field.
 * @returns {'light'|'dark'}
 */
export function detectTheme(element) {
  for (let node = element; node; node = composedParent(node)) {
    const color = parseColor(getComputedStyle(node).backgroundColor);
    if (color && color[3] >= 0.5) return luminance(color) < DARK_LUMINANCE ? 'dark' : 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
