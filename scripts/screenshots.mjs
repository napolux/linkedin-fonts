#!/usr/bin/env node
/**
 * Generates the Chrome Web Store screenshots from the playground, with the
 * real Chrome build of the extension (dist/chrome/content.js) running in
 * headless Chrome. Run with `npm run screenshots` (builds first).
 *
 * The page is rendered at 640×400 CSS pixels with a device scale factor of
 * 2, so every screenshot is a sharp 1280×800 image (the store's preferred
 * size) with large, readable UI. A 640×400 copy is also written when
 * ImageMagick (`magick`) is available.
 *
 * Output: store/screenshots/<scene>.png and <scene>-640x400.png
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { chromePath, launchChrome } from '../test/e2e/drivers.mjs';
import { buttonCenter, pageHelpers } from '../test/e2e/page-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAYGROUND = pathToFileURL(path.join(ROOT, 'playground/index.html')).href;
const OUT = path.join(ROOT, 'store/screenshots');

/** Hides developer-only parts of the playground in the pictures. */
const CLEAN_CSS = `
  .codepoints, header p, main > section > h2 { display: none !important; }
  main > section:has([role="combobox"]), main > section:last-of-type { display: none !important; }
  body { padding-top: 20px !important; }
  html { scrollbar-width: none; }
`;

/** Store-friendly wording for headings and sample text (pictures only). */
const POLISH = `(() => {
  document.querySelector('h1').textContent = 'Fonts for LinkedIn';
  for (const heading of document.querySelectorAll('.modal h2')) {
    heading.textContent = heading.textContent.replace(/\\s*\\(.*\\)$/, '');
  }
  document.getElementById('textarea').value =
    'I write about product, engineering and leadership.\\nOpinions are my own.';
  return true;
})()`;

if (!chromePath) {
  console.error('Google Chrome not found: set CHROME_PATH.');
  process.exit(1);
}

const browser = await launchChrome();
await browser.cdp('Emulation.setDeviceMetricsOverride', {
  width: 640,
  height: 400,
  deviceScaleFactor: 2,
  mobile: false,
});

const call = (helper, ...args) =>
  browser.evaluate(`window.e2e.${helper}(${args.map((arg) => JSON.stringify(arg)).join(', ')})`);

/** Clicks a real toolbar button, like a user would. */
async function press(style) {
  const box = await call('toolbar');
  if (!box) throw new Error(`Toolbar not visible when pressing ${style}`);
  await browser.click(...buttonCenter(box, style));
  await call('settle');
}

async function scene(name, { dark = false, setup }) {
  await browser.open(PLAYGROUND);
  await browser.evaluate(`(${pageHelpers})()`);
  await browser.evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = ${JSON.stringify(CLEAN_CSS)};
    document.head.append(style);
    document.documentElement.classList.toggle('dark', ${dark});
    return true;
  })()`);
  await browser.evaluate(POLISH);
  await setup();

  const file = path.join(OUT, `${name}.png`);
  await writeFile(file, await browser.screenshot());
  try {
    execFileSync('magick', [file, '-resize', '640x400', path.join(OUT, `${name}-640x400.png`)]);
  } catch {
    // ImageMagick is optional: the 1280×800 version is what the store prefers.
  }
  console.log(`✔ ${path.relative(ROOT, file)}`);
}

const openModal = (id) => browser.evaluate(`(document.getElementById(${JSON.stringify(id)}).showModal(), true)`);

await mkdir(OUT, { recursive: true });

const boldItalicPost = async () => {
  await call('select', '#rich', 'Hello world');
  await press('bold');
  await press('italic');
};

await scene('1-post-light', { setup: boldItalicPost });
await scene('2-post-dark', { dark: true, setup: boldItalicPost });

await scene('3-start-a-post-modal', {
  setup: async () => {
    await openModal('post-dialog');
    await call('select', '#dialog-rich', 'new role');
    await press('bold');
  },
});

await scene('4-profile-headline', {
  setup: async () => {
    await openModal('intro-dialog');
    await call('select', '#dialog-input', 'Example Corp');
    await press('underline');
  },
});

await scene('5-messaging', {
  setup: async () => {
    await browser.evaluate(`(document.getElementById('chat-host').scrollIntoView({ block: 'end' }), window.scrollBy(0, 24), true)`);
    await call('select', '#chat-host >>> [contenteditable]', 'how are you');
    await press('bold');
  },
});

await browser.close();
