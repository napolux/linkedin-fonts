# Fonts for LinkedIn

[![CI](https://github.com/napolux/linkedin-fonts/actions/workflows/ci.yml/badge.svg)](https://github.com/napolux/linkedin-fonts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A tiny browser extension for **Chrome** and **Firefox** that adds **Bold**, *Italic* and
<u>Underline</u> to LinkedIn posts, comments, messages and profile fields.

Select some text in any LinkedIn text field and a small toolbar appears, in
light or dark mode to match LinkedIn:

| Light mode                                                 | Dark mode                                                |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| ![Toolbar in light mode](DOCS/images/toolbar-light.png)    | ![Toolbar in dark mode](DOCS/images/toolbar-dark.png)    |

Press a button (or <kbd>⌘</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> on macOS,
<kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> on Windows and Linux) and
the selected text is rewritten with Unicode look-alike characters:

| Style       | Result                       |
| ----------- | ---------------------------- |
| Bold        | 𝗜'𝗺 𝗵𝗮𝗽𝗽𝘆 𝘁𝗼 𝗮𝗻𝗻𝗼𝘂𝗻𝗰𝗲      |
| Italic      | 𝘐'𝘮 𝘩𝘢𝘱𝘱𝘺 𝘵𝘰 𝘢𝘯𝘯𝘰𝘶𝘯𝘤𝘦      |
| Bold italic | 𝙄'𝙢 𝙝𝙖𝙥𝙥𝙮 𝙩𝙤 𝙖𝙣𝙣𝙤𝙪𝙣𝙘𝙚      |
| Underline   | I̲'̲m̲ ̲h̲a̲p̲p̲y̲ ̲t̲o̲ ̲a̲n̲n̲o̲u̲n̲c̲e̲ |

LinkedIn has no rich text, so this is the only kind of formatting that survives
publishing: the characters themselves are styled, and everyone sees them.

## Features

- **Stackable styles.** The toolbar stays open while the text is selected, so
  you can combine bold, italic and underline. Pressing an active style removes it.
- **Works everywhere you write on LinkedIn**: posts, comments, messages,
  headline, About section and other text fields.
- **Accented letters** (à, é, ñ, ü…) are supported. Plain text comes back
  exactly as it was when you remove a style.
- **Native undo**: <kbd>⌘</kbd>+<kbd>Z</kbd> (macOS) or <kbd>Ctrl</kbd>+<kbd>Z</kbd> reverts a change.
- **Light and dark mode**, following LinkedIn's own theme.
- **Private by design**: no permissions, no network requests, no data
  collection. It runs only on `www.linkedin.com`.
- **Tiny**: vanilla JavaScript and CSS, no runtime dependencies, about 15 KB.

## Install

- **Chrome Web Store**: coming soon.
- **Firefox Add-ons**: coming soon.
- **From source**: build it yourself and load it in developer mode, see below.

## Build and install from source

Use this to try the extension before it is on the stores, or to test your own
changes. It works the same on macOS, Windows and Linux.

### 1. Requirements

- [Git](https://git-scm.com/downloads).
- [Node.js](https://nodejs.org/) **22 or newer** (`node --version` to check).
  - macOS: `brew install node`, or the installer from nodejs.org.
  - Windows: `winget install OpenJS.NodeJS.LTS`, or the installer from nodejs.org.

### 2. Build

In a terminal (Terminal on macOS, PowerShell on Windows):

```sh
git clone https://github.com/napolux/linkedin-fonts.git
cd linkedin-fonts
npm ci
npm run build
```

This creates two folders, one per browser:

- `dist/chrome/`: for Chrome, Edge, Brave and other Chromium browsers;
- `dist/firefox/`: for Firefox.

### 3a. Install in Chrome (Edge, Brave…)

1. Open `chrome://extensions` (`edge://extensions` in Edge, `brave://extensions` in Brave).
2. Turn on **Developer mode** (top right in Chrome, left sidebar in Edge).
3. Click **Load unpacked** and select the `dist/chrome` folder.
4. Open (or reload) a tab on [linkedin.com](https://www.linkedin.com/).

The extension stays installed across browser restarts. Do not delete or move
the `linkedin-fonts` folder, because Chrome loads the extension from it.

### 3b. Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select the file `dist/firefox/manifest.json`.
3. Open (or reload) a tab on [linkedin.com](https://www.linkedin.com/).

Firefox removes temporary add-ons when it closes, so repeat step 2 after
each restart. Regular Firefox only installs signed add-ons permanently. For
a permanent unsigned install, use Firefox Developer Edition or Nightly: set
`xpinstall.signatures.required` to `false` in `about:config`, run
`npm run package`, rename `artifacts/linkedin-fonts-firefox-<version>.zip`
to `linkedin-fonts.xpi`, and install it from `about:addons` → ⚙️ →
**Install Add-on From File…**.

### 4. Update to the latest version

```sh
git pull
npm ci
npm run build
```

Then reload the extension: the ↻ icon on its card in `chrome://extensions`,
or **Reload** in `about:debugging`. Reload your LinkedIn tabs too.

### Debugging

- Run `npm run watch` instead of `npm run build`. It rebuilds on every change,
  without minification and with source maps, so DevTools shows the original
  files.
- `npm run dev:chrome` / `npm run dev:firefox` open a separate browser profile
  with the extension already loaded (you will need to log in to LinkedIn there).
- More tips in [DOCS/development.md](DOCS/development.md#debugging).

## Keyboard shortcuts

They work when text is selected inside a LinkedIn text field. Anywhere else,
the browser's own shortcuts are left alone.

| Action    | Windows / Linux             | macOS                    |
| --------- | --------------------------- | ------------------------ |
| Bold      | <kbd>Ctrl</kbd>+<kbd>B</kbd> | <kbd>⌘</kbd>+<kbd>B</kbd> |
| Italic    | <kbd>Ctrl</kbd>+<kbd>I</kbd> | <kbd>⌘</kbd>+<kbd>I</kbd> |
| Underline | <kbd>Ctrl</kbd>+<kbd>U</kbd> | <kbd>⌘</kbd>+<kbd>U</kbd> |

On macOS only <kbd>⌘</kbd> works: <kbd>Ctrl</kbd>+<kbd>B</kbd>, <kbd>I</kbd> and
<kbd>U</kbd> are never intercepted and keep their usual macOS behaviour.

## Good to know

Styled characters are separate Unicode symbols, not real formatting. Screen
readers may read them poorly and LinkedIn search does not match them, so use
them for emphasis, not for entire posts. Details in
[DOCS/limitations.md](DOCS/limitations.md).

## Documentation

All documentation lives in [`DOCS/`](DOCS/README.md):

- [Architecture](DOCS/architecture.md): how the extension works.
- [Unicode mapping](DOCS/unicode.md): which characters are used and why.
- [Development](DOCS/development.md): build, run, test, debug.
- [Releasing](DOCS/releasing.md): versioning and store submission.
- [Limitations](DOCS/limitations.md): known trade-offs.
- [Privacy](DOCS/privacy.md): what the extension does (and does not do) with your data.

## Quick start for developers

```sh
npm install
npm run build        # dist/chrome and dist/firefox
npm test             # unit tests
npm run test:e2e     # real Chrome and Firefox, headless
npm run dev:firefox  # or dev:chrome: opens a browser with the extension loaded
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE) © Francesco Napoletano

*This project is not affiliated with, endorsed by or sponsored by LinkedIn
Corporation. LinkedIn is a registered trademark of LinkedIn Corporation.*
