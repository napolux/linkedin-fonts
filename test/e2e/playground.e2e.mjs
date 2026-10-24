/**
 * End-to-end tests: drive real Chrome and Firefox (headless) on
 * playground/index.html, with real mouse clicks on the toolbar and real
 * keyboard shortcuts. Run with `npm run test:e2e` (builds first).
 *
 * A browser that is not installed is skipped. Screenshots for visual
 * review are written to artifacts/e2e/.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { applyStyle } from '../../src/content/unicode.js';
import { chromePath, firefoxPath, launchChrome, launchFirefox } from './drivers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYGROUND = pathToFileURL(path.join(ROOT, 'playground/index.html')).href;
const SCREENSHOTS = path.join(ROOT, 'artifacts/e2e');

const bold = (text) => applyStyle(text, 'bold', true);
const italic = (text) => applyStyle(text, 'italic', true);
const underline = (text) => applyStyle(text, 'underline', true);

/**
 * Installed in the page as `window.e2e`. Serialized with toString(), so it
 * must not reference anything outside its own body.
 */
function pageHelpers() {
  const settle = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))));
  const isControl = (element) => element.localName === 'textarea' || element.localName === 'input';

  window.e2e = {
    settle,

    /** Selects from the first `from` to the end of the following `to`. */
    async select(selector, from, to = from) {
      const element = document.querySelector(selector);
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

    async collapse(selector) {
      const element = document.querySelector(selector);
      if (isControl(element)) element.setSelectionRange(0, 0);
      else document.getSelection().collapse(element, 0);
      await settle();
    },

    selected() {
      const element = document.activeElement;
      return isControl(element)
        ? element.value.slice(element.selectionStart, element.selectionEnd)
        : document.getSelection().toString();
    },

    /** Textarea/input value, or the text of each <p> of a rich editor. */
    value(selector) {
      const element = document.querySelector(selector);
      return isControl(element) ? element.value : [...element.querySelectorAll('p')].map((p) => p.textContent);
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
function buttonCenter(box, style) {
  const column = { bold: 1, italic: 3, underline: 5 }[style];
  return [box.left + ((box.right - box.left) * column) / 6, (box.top + box.bottom) / 2];
}

const BROWSERS = [
  { name: 'Chrome', launch: launchChrome, binary: chromePath },
  { name: 'Firefox', launch: launchFirefox, binary: firefoxPath },
];

for (const { name, launch, binary } of BROWSERS) {
  describe(name, { skip: binary ? false : `${name} is not installed` }, () => {
    let browser;
    // Decided by the host OS, not by the page: on a Mac users press Cmd, and the
    // test must catch the extension expecting anything else.
    const mac = process.platform === 'darwin';

    const call = (helper, ...args) =>
      browser.evaluate(`window.e2e.${helper}(${args.map((arg) => JSON.stringify(arg)).join(', ')})`);

    const press = async (style) => {
      const box = await call('toolbar');
      assert.ok(box, 'the toolbar should be visible');
      await browser.click(...buttonCenter(box, style));
      await call('settle');
    };

    const shortcut = async (letter) => {
      await browser.shortcut(letter, { mac });
      await call('settle');
    };

    const reload = async () => {
      await browser.open(PLAYGROUND);
      await browser.evaluate(`(${pageHelpers})()`);
    };

    before(async () => {
      browser = await launch(binary);
    });

    after(async () => {
      await browser?.close();
    });

    beforeEach(async () => {
      await reload();
    });

    test('shows the toolbar above a selection in a rich editor', async () => {
      assert.equal(await call('toolbar'), null);
      await call('select', '#rich', 'Hello world');
      const box = await call('toolbar');
      assert.ok(box, 'the toolbar should be visible');
      assert.ok(box.bottom <= (await call('selectionTop')), 'the toolbar should be above the text');
    });

    test('stacks bold and italic while keeping the selection', async () => {
      await call('select', '#rich', 'Hello world');

      await press('bold');
      assert.equal(await call('selected'), bold('Hello world'));

      await press('italic');
      const boldItalic = italic(bold('Hello world'));
      assert.equal(await call('selected'), boldItalic);
      assert.equal((await call('value', '#rich'))[0], `${boldItalic}, this is a LinkedIn post.`);

      await press('bold');
      assert.equal(await call('selected'), italic('Hello world'));
    });

    test('underlines across paragraphs, leaving the mention untouched', async () => {
      const original = await call('value', '#rich');
      await call('select', '#rich', 'LinkedIn post.', 'for the help');
      await press('underline');

      // Like when typing, browsers turn a space next to an inline element (the
      // mention) into a no-break space: compare with regular spaces.
      const paragraphs = (await call('value', '#rich')).map((p) => p.replaceAll('\u00A0', ' '));
      assert.deepEqual(paragraphs, [
        `Hello world, this is a ${underline('LinkedIn post.')}`,
        underline(original[1]),
        `${underline('Thanks ')}Jane Doe${underline(' for the help')}.`,
      ]);
    });

    test('underlining the last character of a paragraph keeps the paragraphs apart', async () => {
      const original = await call('value', '#rich');
      // The first '.' of the editor ends the first paragraph.
      await call('select', '#rich', '.');
      await press('underline');
      assert.deepEqual(await call('value', '#rich'), [
        original[0].replace(/\.$/, underline('.')),
        original[1],
        original[2],
      ]);
      await press('underline');
      assert.deepEqual(await call('value', '#rich'), original);
    });

    test('styling part of a paragraph leaves the text around it untouched', async () => {
      await call('select', '#rich', 'world');
      await press('bold');
      assert.equal((await call('value', '#rich'))[0], `Hello ${bold('world')}, this is a LinkedIn post.`);
    });

    test('bold around a mention leaves the mention untouched', async () => {
      await call('select', '#rich', 'Thanks', 'for the help');
      await press('bold');
      const paragraph = (await call('value', '#rich'))[2].replaceAll('\u00A0', ' ');
      assert.equal(paragraph, `${bold('Thanks')} Jane Doe ${bold('for the help')}.`);
    });

    test('keyboard shortcuts work in a rich editor', async () => {
      await call('select', '#rich', 'Hello world');
      await shortcut('b');
      await shortcut('i');
      await shortcut('u');
      assert.equal(await call('selected'), underline(italic(bold('Hello world'))));
    });

    test('round-trips accented letters and keeps emoji intact', async () => {
      const original = (await call('value', '#rich'))[1];
      await call('select', '#rich', 'Perché', '👋');
      await press('bold');
      assert.equal((await call('value', '#rich'))[1], bold(original));
      await press('bold');
      assert.equal((await call('value', '#rich'))[1], original);
    });

    test('keyboard shortcut toggles bold in a textarea', async () => {
      const original = await call('value', '#textarea');
      await call('select', '#textarea', 'web development');

      await shortcut('b');
      assert.equal(await call('selected'), bold('web development'));
      assert.equal(await call('value', '#textarea'), original.replace('web development', bold('web development')));

      await shortcut('b');
      assert.equal(await call('value', '#textarea'), original);
    });

    test('toolbar works on a single-line input', async () => {
      await call('select', '#input', 'Example Corp');
      await press('underline');
      assert.equal(await call('value', '#input'), `Software engineer at ${underline('Example Corp')}`);
      assert.equal(await call('selected'), underline('Example Corp'));
    });

    test('hides the toolbar when the selection is cleared', async () => {
      await call('select', '#rich', 'Hello world');
      assert.ok(await call('toolbar'));
      await call('collapse', '#rich');
      assert.equal(await call('toolbar'), null);
    });

    test('ignores search boxes and static text', async () => {
      await call('select', 'input[role="combobox"]', 'search');
      assert.equal(await call('toolbar'), null);
      await call('select', 'section:last-of-type p', 'not editable');
      assert.equal(await call('toolbar'), null);
    });

    test('changes are on the native undo stack', async () => {
      await call('select', '#rich', 'Hello world');
      await press('bold');
      await browser.evaluate('document.execCommand("undo")');
      assert.equal((await call('value', '#rich'))[0], 'Hello world, this is a LinkedIn post.');
    });

    test('saves light and dark screenshots for visual review', async () => {
      await mkdir(SCREENSHOTS, { recursive: true });
      for (const theme of ['light', 'dark']) {
        await reload();
        if (theme === 'dark') await browser.evaluate('document.documentElement.classList.add("dark")');
        await call('select', '#rich', 'Hello world');
        await press('bold');
        const file = path.join(SCREENSHOTS, `${name.toLowerCase()}-${theme}.png`);
        await writeFile(file, await browser.screenshot());
      }
    });
  });
}
