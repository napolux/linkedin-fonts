/**
 * Tiny, dependency-free browser drivers for the end-to-end tests:
 * - Chrome through the Chrome DevTools Protocol (CDP);
 * - Firefox through WebDriver BiDi.
 * Both talk over Node's built-in WebSocket and expose the same interface:
 *
 *   open(url), evaluate(expression), click(x, y), drag(x1, y1, x2, y2),
 *   shortcut(letter, modifier),
 *   screenshot() -> Buffer, close()
 *
 * Browsers are found in the usual install locations or through the
 * CHROME_PATH / FIREFOX_PATH environment variables.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const FIREFOX_CANDIDATES = [
  process.env.FIREFOX_PATH,
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
  '/Applications/Firefox Nightly.app/Contents/MacOS/firefox',
  '/usr/bin/firefox',
];

const find = (candidates) => candidates.find((candidate) => candidate && existsSync(candidate));
export const chromePath = find(CHROME_CANDIDATES);
export const firefoxPath = find(FIREFOX_CANDIDATES);

const VIEWPORT = { width: 1000, height: 800 };

/** A free TCP port on localhost. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Starts `binary` and resolves with the first output line capture matching `pattern`. */
function launch(binary, args, pattern) {
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(binary)} did not start:\n${output}`));
    }, 30_000);
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(pattern);
      if (match) {
        clearTimeout(timer);
        resolve({ child, url: match[1] });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`${path.basename(binary)} exited with code ${code}:\n${output}`));
    });
  });
}

/** JSON-RPC style connection shared by CDP and BiDi (same message shape). */
class Connection {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();

  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error(`Cannot connect to ${url}`)), { once: true });
    });
    return new Connection(socket);
  }

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.#pending.get(message.id);
      if (pending) {
        this.#pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`${pending.method}: ${message.message ?? message.error.message ?? message.error}`));
        } else {
          pending.resolve(message.result);
        }
      } else {
        for (const listener of this.#listeners) listener(message);
      }
    });
  }

  send(method, params = {}, extra = {}) {
    const id = this.#nextId++;
    this.#socket.send(JSON.stringify({ id, method, params, ...extra }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject, method }));
  }

  waitFor(predicate, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#listeners.delete(listener);
        reject(new Error('Timed out waiting for a browser event'));
      }, timeout);
      const listener = (message) => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        this.#listeners.delete(listener);
        resolve(message);
      };
      this.#listeners.add(listener);
    });
  }

  close() {
    this.#socket.close();
  }
}

/** Wraps an expression so both protocols return its value as JSON. */
const asJson = (expression) => `(async () => JSON.stringify(await (${expression})))()`;

export async function launchChrome(binary = chromePath) {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'linkedin-fonts-chrome-'));
  const { child, url } = await launch(
    binary,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--no-first-run',
      '--no-default-browser-check',
      // CI containers often cannot provide Chrome's sandbox.
      ...(process.env.CI ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    /DevTools listening on (ws:\/\/\S+)/,
  );

  const connection = await Connection.open(url);
  const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => connection.send(method, params, { sessionId });
  await send('Page.enable');
  // Headless pages are never "focused" unless told so.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  return {
    name: 'chrome',
    /** Chrome only: raw DevTools Protocol command on the page session. */
    cdp: send,
    async open(pageUrl) {
      const loaded = connection.waitFor((m) => m.method === 'Page.loadEventFired' && m.sessionId === sessionId);
      await send('Page.navigate', { url: pageUrl });
      await loaded;
    },
    async evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression: asJson(expression),
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      }
      return result.value === undefined ? undefined : JSON.parse(result.value);
    },
    async click(x, y) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type,
          x,
          y,
          button: type === 'mouseMoved' ? 'none' : 'left',
          clickCount: type === 'mouseMoved' ? 0 : 1,
        });
      }
    },
    /** Presses the left button at (x1, y1), moves to (x2, y2) and releases: a real drag selection. */
    async drag(x1, y1, x2, y2) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, button: 'none' });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 });
      for (const step of [0.25, 0.5, 0.75, 1]) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: x1 + (x2 - x1) * step,
          y: y1 + (y2 - y1) * step,
          button: 'left',
          buttons: 1,
        });
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
    },
    // `modifier` is 'Meta' (Cmd on macOS) or 'Control'.
    async shortcut(letter, modifier) {
      const key = {
        key: letter,
        code: `Key${letter.toUpperCase()}`,
        windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
        modifiers: { Meta: 4, Control: 2 }[modifier], // CDP modifier bit flags
      };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    },
    async screenshot() {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    },
    async close() {
      connection.close();
      child.kill();
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

/** WebDriver key codes (https://w3c.github.io/webdriver/#keyboard-actions). */
const WEBDRIVER_KEYS = {
  Control: String.fromCharCode(0xe009),
  Meta: String.fromCharCode(0xe03d),
};

export async function launchFirefox(binary = firefoxPath) {
  const profile = await mkdtemp(path.join(tmpdir(), 'linkedin-fonts-firefox-'));
  const port = await freePort();
  const { child, url } = await launch(
    binary,
    [
      '--headless',
      `--remote-debugging-port=${port}`,
      '--profile',
      profile,
      '--no-remote',
      '--new-instance',
      `--width=${VIEWPORT.width}`,
      `--height=${VIEWPORT.height}`,
      'about:blank',
    ],
    /WebDriver BiDi listening on (ws:\/\/\S+)/,
  );

  const connection = await Connection.open(`${url}/session`);
  await connection.send('session.new', { capabilities: {} });
  const { contexts } = await connection.send('browsingContext.getTree', {});
  const context = contexts[0].context;

  const perform = (actions) => connection.send('input.performActions', { context, actions });

  return {
    name: 'firefox',
    async open(pageUrl) {
      await connection.send('browsingContext.navigate', { context, url: pageUrl, wait: 'complete' });
    },
    async evaluate(expression) {
      const response = await connection.send('script.evaluate', {
        expression: asJson(expression),
        target: { context },
        awaitPromise: true,
      });
      if (response.type === 'exception') {
        throw new Error(response.exceptionDetails.text);
      }
      return response.result.value === undefined ? undefined : JSON.parse(response.result.value);
    },
    async click(x, y) {
      await perform([
        {
          type: 'pointer',
          id: 'mouse',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: Math.round(x), y: Math.round(y) },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
    },
    /** Presses the left button at (x1, y1), moves to (x2, y2) and releases: a real drag selection. */
    async drag(x1, y1, x2, y2) {
      await perform([
        {
          type: 'pointer',
          id: 'mouse',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: Math.round(x1), y: Math.round(y1) },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', x: Math.round(x2), y: Math.round(y2), duration: 100 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
    },
    // `modifier` is 'Meta' (Cmd on macOS) or 'Control'.
    async shortcut(letter, modifier) {
      await perform([
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: WEBDRIVER_KEYS[modifier] },
            { type: 'keyDown', value: letter },
            { type: 'keyUp', value: letter },
            { type: 'keyUp', value: WEBDRIVER_KEYS[modifier] },
          ],
        },
      ]);
      await connection.send('input.releaseActions', { context });
    },
    async screenshot() {
      const { data } = await connection.send('browsingContext.captureScreenshot', { context });
      return Buffer.from(data, 'base64');
    },
    async close() {
      await connection.send('session.end', {}).catch(() => {});
      connection.close();
      child.kill();
      await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
