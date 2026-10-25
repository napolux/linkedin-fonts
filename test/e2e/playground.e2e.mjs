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
import { buttonCenter, pageHelpers } from './page-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYGROUND = pathToFileURL(path.join(ROOT, 'playground/index.html')).href;
const SCREENSHOTS = path.join(ROOT, 'artifacts/e2e');

const bold = (text) => applyStyle(text, 'bold', true);
const italic = (text) => applyStyle(text, 'italic', true);
const underline = (text) => applyStyle(text, 'underline', true);

const BROWSERS = [
  { name: 'Chrome', launch: launchChrome, binary: chromePath },
  { name: 'Firefox', launch: launchFirefox, binary: firefoxPath },
];

for (const { name, launch, binary } of BROWSERS) {
  describe(name, { skip: binary ? false : `${name} is not installed` }, () => {
    let browser;
    // Decided by the host OS, not by the page: on a Mac users press Cmd (Meta),
    // elsewhere Ctrl, and the test must catch the extension expecting anything else.
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    const otherModifier = modifier === 'Meta' ? 'Control' : 'Meta';

    const call = (helper, ...args) =>
      browser.evaluate(`window.e2e.${helper}(${args.map((arg) => JSON.stringify(arg)).join(', ')})`);

    const press = async (style) => {
      const box = await call('toolbar');
      assert.ok(box, 'the toolbar should be visible');
      await browser.click(...buttonCenter(box, style));
      await call('settle');
    };

    const shortcut = async (letter, using = modifier) => {
      await browser.shortcut(letter, using);
      await call('settle');
    };

    /** Selects text by dragging the real mouse (scripted selections behave differently in shadow DOM). */
    const mouseSelect = async (selector, from, to) => {
      await browser.drag(...(await call('dragPoints', selector, from, to)));
      await call('settle');
    };

    const openModal = async (id) => {
      await browser.evaluate(`(document.getElementById(${JSON.stringify(id)}).showModal(), true)`);
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

    test('ignores the other platform modifier (Ctrl on macOS, Cmd elsewhere)', async () => {
      for (const selector of ['#rich', '#textarea']) {
        const original = await call('value', selector);
        await call('select', selector, selector === '#rich' ? 'Hello world' : 'web development');
        await call('trackKeys');
        for (const letter of ['b', 'i', 'u']) {
          await shortcut(letter, otherModifier);
          assert.equal(await call('lastKeyPrevented'), false, `${otherModifier}+${letter} must reach the page`);
        }
        assert.deepEqual(await call('value', selector), original, `${otherModifier} must not style ${selector}`);
      }
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

        await openModal('post-dialog');
        await call('select', '#dialog-rich', 'new role');
        await press('bold');
        await writeFile(path.join(SCREENSHOTS, `${name.toLowerCase()}-${theme}-modal.png`), await browser.screenshot());
      }
    });

    // LinkedIn's chat overlay renders its editor inside an open shadow root,
    // and Chrome hides that selection from document.getSelection().
    describe('shadow DOM (messaging overlay)', () => {
      const chat = '#chat-host >>> [contenteditable]';

      test('toolbar works in an editor inside a shadow root', async () => {
        await mouseSelect(chat, 'how are you');
        assert.equal(await call('selected'), 'how are you');
        await press('bold');
        await press('underline');
        assert.equal(await call('selected'), underline(bold('how are you')));
        assert.deepEqual(await call('value', chat), [`Hey Jane, ${underline(bold('how are you'))}?`, 'Talk soon.']);
      });

      test('shortcuts work in an editor inside a shadow root', async () => {
        await mouseSelect(chat, 'Jane', 'soon');
        await shortcut('i');
        assert.deepEqual(await call('value', chat), [`Hey ${italic('Jane, how are you?')}`, `${italic('Talk soon')}.`]);
        await shortcut('i');
        assert.deepEqual(await call('value', chat), ['Hey Jane, how are you?', 'Talk soon.']);
      });
    });

    // LinkedIn opens "Start a post" and the profile forms in modal dialogs,
    // which live in the browser's top layer, above any z-index.
    describe('top layer (modal dialogs and popovers)', () => {
      test('toolbar works inside a modal dialog (new post)', async () => {
        await openModal('post-dialog');
        await call('select', '#dialog-rich', 'new role');
        await press('bold');
        await press('italic');
        assert.equal(await call('selected'), italic(bold('new role')));
        assert.equal(
          (await call('value', '#dialog-rich'))[0],
          `Excited to share my ${italic(bold('new role'))} at Example Corp.`,
        );
        assert.equal(await browser.evaluate('document.getElementById("post-dialog").open'), true);
      });

      test('toolbar works on profile fields inside a modal dialog', async () => {
        await openModal('intro-dialog');
        await call('select', '#dialog-input', 'Example Corp');
        await press('underline');
        assert.equal(await call('value', '#dialog-input'), `Senior engineer at ${underline('Example Corp')}`);

        await call('select', '#dialog-textarea', 'the web');
        await press('bold');
        assert.equal(await call('value', '#dialog-textarea'), `I build things for ${bold('the web')}.`);
      });

      test('toolbar works inside a popover and keeps it open', async () => {
        await browser.evaluate('(document.getElementById("chat-popover").showPopover(), true)');
        await call('select', '#popover-rich', 'see you');
        await press('bold');
        assert.equal(await call('selected'), bold('see you'));
        assert.equal(await browser.evaluate('document.getElementById("chat-popover").matches(":popover-open")'), true);
      });

      test('toolbar comes back on the page after the modal closes', async () => {
        await openModal('post-dialog');
        await call('select', '#dialog-rich', 'new role');
        assert.ok(await call('toolbar'));
        await browser.evaluate('(document.getElementById("post-dialog").close(), true)');
        await call('select', '#rich', 'Hello world');
        await press('bold');
        assert.equal(await call('selected'), bold('Hello world'));
      });
    });
  });
}
