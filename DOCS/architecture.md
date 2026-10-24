# Architecture

Fonts for LinkedIn is a single **content script**. There is no background
service worker, no popup, no options page and no extension API call. Both
browsers run the same `content.js` on `https://www.linkedin.com/*` pages; only
the manifest differs per browser.

The code lives in `src/content/`. Arrows mean "imports", and dashed boxes
are pure modules (no DOM access) that are unit-tested in Node:

```mermaid
flowchart TD
    index["index.js<br/>events, shortcuts"]
    index --> unicode["unicode.js<br/>styling rules"]
    index --> editable["editable.js<br/>supported field?"]
    index --> replace["replace.js<br/>rewrite + reselect"]
    index --> position["position.js<br/>selection box"]
    index --> theme["theme.js<br/>light / dark"]
    index --> toolbar["toolbar.js<br/>toolbar UI"]
    editable --> offsets["offsets.js<br/>text offsets"]
    replace --> offsets
    replace --> diff["diff.js<br/>minimal edit"]
    toolbar --> css["toolbar.css"]

    classDef pure stroke-dasharray: 5 4
    class unicode,diff pure
```

`src/manifest/` holds the shared and per-browser manifest fields, and
`src/icons/` the icon (SVG source and PNGs). See [Build](#build).

## The big picture

Every event that can change the selection leads to a **refresh**, which
shows, moves, updates or hides the toolbar:

```mermaid
flowchart TD
    events["selection, focus, keyboard,<br/>pointer, scroll and resize events"]
    events --> schedule["scheduleRefresh()<br/>once per animation frame"]
    schedule --> drag{{"mouse button down?"}}
    drag -- "yes: wait for pointerup" --> wait(["no change"])
    drag -- no --> target["getActiveTarget()"]
    target -- "null: no selection, unsupported<br/>or unfocused field" --> hide["toolbar.hide()"]
    target -- target --> container["topLayerAncestor()<br/>dialog, popover or html"]
    container --> box["getSelectionBox()"]
    box -- "null: off screen" --> hide
    box -- box --> show["analyze() + detectTheme()<br/>toolbar.show(box, state, theme)"]
```

Pressing a button or a shortcut **toggles** a style on the selection:

```mermaid
sequenceDiagram
    actor User
    participant Index as index.js
    participant Unicode as unicode.js
    participant Replace as replace.js
    participant Editor as LinkedIn field

    User->>Index: click B / I / U, or ⌘ (macOS) / Ctrl + B / I / U
    Index->>Index: getActiveTarget()
    Index->>Unicode: analyze(selected text)
    Unicode-->>Index: does all of it already have the style?
    Note over Index: enabled = not active, so the style is added or removed
    Index->>Replace: replaceSelection(target, text → applyStyle(text, style, enabled))
    loop every changed segment, last to first
        Replace->>Editor: select the changed characters, execCommand insertText
        Editor-->>Replace: beforeinput / input, the editor updates its model
    end
    Replace->>Editor: select the new text again
    Index->>Index: scheduleRefresh(), buttons show the new state
```

The toolbar stays visible as long as there is a non-empty selection inside a
focused LinkedIn field, and that is what makes styles stackable: after
pressing **B** the bold text is still selected, so **I** turns it into bold
italic.

## Module by module

### `unicode.js`: the styling rules

Pure functions with no DOM access, unit-tested in Node:

- `analyze(text)` returns `{ bold, italic, underline, canBold, canItalic, canUnderline }`.
  A style is *active* only if **every** character it can apply to already has
  it. `canX` is false when nothing in the text can take the style (e.g. only emoji).
- `applyStyle(text, style, enabled)` sets or clears one style and preserves
  the others. It is explicit rather than a toggle, so the same decision can be
  applied to several pieces of one selection independently.
- `toggleStyle(text, style)` is a convenience for "what a button does".

Text is processed grapheme by grapheme (`Intl.Segmenter`), so emoji sequences,
flags and accented letters are never split. The mapping tables and the
reasoning behind them are in [unicode.md](unicode.md).

### `editable.js`: what counts as a field

`getActiveTarget()` describes the current selection, or returns `null`:

| Kind      | Elements                                            | Selection source                           |
| --------- | --------------------------------------------------- | ------------------------------------------ |
| `control` | `<textarea>`, `<input type="text">`                 | `selectionStart` / `selectionEnd`          |
| `rich`    | any `contenteditable` element (outermost editing host) | `document.getSelection()` + text offsets |

Rules:

- The field must be focused. A selection left behind after clicking elsewhere does not count.
- Read-only and disabled fields are ignored, and so are search boxes with
  suggestions (`role="combobox"`): they are not content.
- Detection never relies on LinkedIn class names. They change often, and
  `isContentEditable` / element types do not.

### `offsets.js`: positions that survive edits

Rich editors (LinkedIn uses several) split, merge and re-create DOM nodes
while you type, so a DOM `Range` captured before an edit is unreliable after
it. Positions are therefore expressed as a **text offset**: the number of
UTF-16 code units that precede the position, counting all text nodes of the
editing host in document order. Block boundaries contribute nothing.

- `pointToOffset(root, node, offset)` converts a `Range` boundary to a number.
- `offsetToPoint(root, offset, affinity)` converts back. At a boundary between
  two text nodes, `affinity` picks the end of the first (`'backward'`) or the
  start of the second (`'forward'`).
- `textSegments(root, start, end)` splits a selection into rewritable pieces:
  one per editable text node, and one per line inside it. These are skipped:
  - text in `contenteditable="false"` islands (e.g. mention chips);
  - whitespace that is not rendered (indentation between `<p>` elements);
  - line breaks, which are never sent to the editor because inserting them
    would create new paragraphs.

### `diff.js` and `replace.js`: editing like a user

`replaceSelection(target, transform)` computes the new text and writes it back.

**How text is written.** With `document.execCommand('insertText')` (or
`'delete'` for a pure deletion). The API is officially deprecated, but it is
still supported by every browser and nothing else edits text *as if the user
had typed it*:

- the browser fires trusted `beforeinput` and `input` events, so every editor
  framework (Quill, React, Lexical, ProseMirror…) updates its own model;
- the change is recorded on the native undo stack, so undo (<kbd>⌘</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Z</kbd>) works.

Setting `textContent` or `value` directly would desynchronize the editor:
LinkedIn would publish the old text, or overwrite the new one on its next render.

**Fallback.** If the browser refuses the command *and* no `beforeinput` was
fired, the DOM is edited directly (`Range.insertNode` or `setRangeText`) and an
`input` event is dispatched. The `beforeinput` check matters: an editor that
cancels `beforeinput` and applies the change itself can make `execCommand`
return `false`, and a blind fallback would then insert the text twice.

**Minimal edits.** `minimalEdit(original, replacement)` trims the common prefix
and suffix (without splitting surrogate pairs), so only characters that change
are rewritten. Unchanged spaces at the edges are left alone. Otherwise the
browser could turn them into no-break spaces, and the undo history stays small.

**Rich editors, step by step:**

1. The selection becomes text offsets `[start, end)` and is split into segments.
2. Segments are rewritten **from last to first**: changing a segment never
   moves the offsets of the ones before it, even if the editor re-renders.
   Each segment is mapped back to DOM points on the *current* DOM right
   before it is edited. A pure insertion (e.g. adding U+0332 after the last
   letter of a paragraph) is a single caret point, kept inside the segment's
   own text node. Resolving its two ends separately could produce a range
   that spans a paragraph boundary, and inserting over it would merge the
   paragraphs.
3. The total length change `delta` is accumulated, and `[start, end + delta)`
   is selected again.
4. One animation frame later the same range is selected once more, for
   editors that re-render asynchronously and move the caret after we are done.

**Text controls** are simpler: `setSelectionRange` on the changed part,
`insertText`, then `setSelectionRange(start, start + replacement.length)`.

### `position.js`: where the selection is

- Rich editors: the union of `range.getClientRects()`.
- Text controls do not expose selection geometry, so a hidden **mirror**
  element is built with the field's box and font metrics (copied from
  `getComputedStyle`), with the text before the selection plus a `<span>`
  containing the selection, then the span is measured. Single-line inputs use
  the field's own top and bottom (their text is vertically centred). The
  result is clipped to the visible part of the field.
- If the box is outside the viewport (scrolled away), the toolbar hides and
  comes back when the selection is visible again.

### `theme.js`: light or dark

LinkedIn has its own appearance setting, independent of the operating system,
and its markup changes often. So the theme is detected from **what is on
screen**: walking up from the edited field, the first background colour with
at least 50% opacity decides (relative luminance below 0.35 means dark).
Colours in modern formats (`oklch()`, `color()`) are converted through a 1×1
canvas. If every ancestor is transparent, `prefers-color-scheme` is used.
The check runs when the toolbar appears or moves to another field.

### `toolbar.js` + `toolbar.css`: the UI

- The host is a `<linkedin-fonts-toolbar>` element with a **closed shadow
  root**. LinkedIn's CSS cannot style it and its scripts cannot reach into
  it, and the extension's CSS cannot leak into the page. The host's inline
  styles use `all: initial !important`, so page rules that target every
  element cannot move it either.
- **Top layer.** LinkedIn opens "Start a post" and the profile forms in
  modal `<dialog>`s. A modal dialog lives in the browser's *top layer*, drawn
  above everything (z-index does not help), and it makes every element
  outside it inert (not clickable). So the host is a `popover="manual"`:
  - it is attached inside the closest open `<dialog>` or popover around the
    edited field (`topLayerAncestor()`, which also crosses shadow roots), or
    to `<html>` when there is none. Being inside the dialog keeps it
    clickable, and it never light-dismisses LinkedIn's own popovers;
  - it is opened with `showPopover()` every time the toolbar appears, so it
    sits on top of the top layer, above the dialog. Top-layer rendering also
    escapes the dialog's `transform` and `overflow`;
  - it is closed (`hidePopover()`) when the toolbar hides.

  ```mermaid
  flowchart LR
      field["edited field"] --> ancestor{{"inside an open<br/>dialog or popover?"}}
      ancestor -- yes --> inside["host appended<br/>inside that element"]
      ancestor -- no --> html["host appended<br/>to html"]
      inside & html --> top["showPopover()<br/>top of the top layer"]
  ```
- **It never takes focus.** `mousedown` is cancelled on the toolbar, which
  keeps focus and selection in the editor. Buttons have `tabindex="-1"` and use
  `aria-disabled` rather than `disabled`, because disabled buttons swallow
  mouse events in some browsers and the selection would be lost.
- Accessibility: `role="toolbar"`, `aria-pressed` on each button,
  `aria-keyshortcuts`, tooltips with the shortcut, forced-colors support,
  `prefers-reduced-motion` support.
- Placement: centred above the selection, 8 px away; below it if there is no
  room above; always clamped inside the viewport.

### `index.js`: wiring

- All listeners are registered in the **capture** phase, so page scripts
  cannot stop events before the extension sees them.
- Bursts of events (dragging a selection, scrolling) are batched into one
  refresh per animation frame.
- While the mouse button is held down the toolbar is hidden and refreshed on
  `pointerup`, so it does not chase the cursor during a drag selection.
  Keyboard selections (<kbd>Shift</kbd>+arrows) update immediately.
- **Shortcuts**: <kbd>⌘</kbd> on macOS, <kbd>Ctrl</kbd> on Windows/Linux,
  without <kbd>Alt</kbd>/<kbd>Shift</kbd>.
  - The modifier is strict. On macOS, <kbd>Ctrl</kbd>+<kbd>B</kbd> (and
    <kbd>⌘</kbd>+<kbd>Ctrl</kbd>+<kbd>B</kbd>) is never intercepted and keeps its
    native meaning. On Windows/Linux, the <kbd>Win</kbd>/<kbd>Meta</kbd> key is ignored.
  - macOS is detected from `navigator.userAgentData.platform` (`"macOS"` in
    Chromium) or `navigator.platform` (`"MacIntel"`), case-insensitively.
  - `event.key` is used for Latin keyboard layouts (AZERTY, QWERTZ…), and
    `event.code` (physical key) for non-Latin ones.
  - The browser default (bookmarks, page info, view source) and the native
    contenteditable bold/italic are prevented **only** when there is a
    selection in a supported field.
  - Key repeats are swallowed but do not toggle again.
- A global flag (`Symbol.for('linkedin-fonts.loaded')`) prevents a second
  instance if the script is injected twice.

## Manifest and permissions

Both manifests are Manifest V3 and declare **no permissions and no host
permissions**. The only capability is a content script matching
`https://www.linkedin.com/*` (`all_frames: true`, so LinkedIn editors inside
same-site iframes work too). Declaring the content script in the manifest is
enough to inject it, and that keeps the install prompt and the store review
as small as possible.

| Key                         | Chrome                      | Firefox                                                   |
| --------------------------- | --------------------------- | --------------------------------------------------------- |
| Minimum version             | `minimum_chrome_version` 120 | `strict_min_version` 140 (desktop), 142 (Android)        |
| Extension ID                | assigned by the Web Store   | `linkedin-fonts@napolux.com`                             |
| Data collection declaration | in the store listing        | `data_collection_permissions: { required: ["none"] }`    |

## Build

`scripts/build.mjs` produces `dist/chrome/` and `dist/firefox/` from the same
sources:

```mermaid
flowchart LR
    subgraph shared["Shared sources"]
        code["src/content/*.js<br/>toolbar.css"]
        base["src/manifest/base.json"]
        assets["src/icons/*.png<br/>LICENSE"]
    end
    subgraph overrides["Per-browser overrides"]
        chromeOverride["src/manifest/chrome.json"]
        firefoxOverride["src/manifest/firefox.json"]
    end
    build(["scripts/build.mjs<br/>esbuild + manifest merge + copy<br/>version from package.json"])
    shared --> build
    overrides --> build
    build --> chromeDist["dist/chrome/<br/>content.js for chrome120<br/>manifest.json, icons, LICENSE"]
    build --> firefoxDist["dist/firefox/<br/>content.js for firefox140<br/>manifest.json, icons, LICENSE"]
```

1. esbuild bundles `src/content/index.js` into one classic script (IIFE)
   targeting `chrome120` / `firefox140`, with `toolbar.css` imported as a
   string. Release builds are minified; `--watch` builds are not, and include
   source maps.
2. `scripts/lib/manifest.mjs` deep-merges `base.json` with the browser
   override and injects the version from `package.json`.
3. Icons and the license are copied.

See [development.md](development.md) for all the commands.
