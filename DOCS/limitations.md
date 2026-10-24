# Limitations

The extension does not add real formatting: LinkedIn has none. It swaps
characters for look-alikes, and that comes with trade-offs worth knowing,
and worth telling users.

## Accessibility

Screen readers see different characters, not styled letters. Depending on
the reader, `𝗛𝗲𝗹𝗹𝗼` may be read as "mathematical sans-serif bold capital H…",
spelled out letter by letter, or skipped. Underlined text (`a̲`) may be read
with "combining low line" after each letter.

**Use styled text sparingly**: a few words of emphasis, not whole paragraphs,
and never for information that matters (dates, links, calls to action).

## Search and copy

- LinkedIn search and most search engines treat `𝗛𝗲𝗹𝗹𝗼` and `Hello` as different
  words, so styled words are effectively invisible to search. Do not style
  keywords, names or hashtags you want people to find.
- Text copied from a styled post stays styled. Pasting it elsewhere keeps the
  special characters.

## Character limits

Each styled letter is one Unicode character but **two UTF-16 code units**, and
underline adds a combining mark to every character. Length limits that count
code units (the headline, for example) can be reached sooner than the visible
text suggests. If a field silently truncates the result, shorten the text or
style less of it.

## Rendering

- Mathematical Alphanumeric Symbols are supported by all current operating
  systems, but very old devices may show boxes (tofu).
- Combining accents (`𝗲̀`) and the underline mark (U+0332) are positioned by
  the reader's font, so some fonts draw them slightly offset.
- Sans-serif styled letters come from a different font than LinkedIn's UI
  font, so they can look slightly different from regular text.

## Unsupported characters

Bold and italic apply only to `A–Z`, `a–z`, their accented forms and `0–9`
(bold only). Letters with no decomposition (`ß ø æ œ ł đ`), Greek, Cyrillic
and every other script are left unchanged. See [unicode.md](unicode.md).

## Editing behaviour

- **Spaces next to mentions**: when a change touches a space right next to an
  inline element such as a mention, the browser may turn that space into a
  no-break space (U+00A0), exactly as when you type there. It looks the same.
- **Mentions and other non-editable chips** are never modified, even when
  they are part of the selection.
- **Undo** reverts edits one browser command at a time: a style applied to a
  selection spanning several paragraphs may take several undo steps.

## Dependence on LinkedIn

The extension relies only on standard web platform behaviour
(`contenteditable`, `textarea`, `input`, selection APIs, `execCommand`), not
on LinkedIn's class names. A LinkedIn redesign is still the most likely
cause of breakage, for example an editor that rejects synthetic edits or
re-renders in a way that loses the selection. If you notice that, please
[open an issue](https://github.com/napolux/linkedin-fonts/issues) with the
page and the steps.

## Platforms

- Desktop Chrome (and other Chromium browsers) 120+ and desktop Firefox 140+.
- Mobile browsers are **not tested**. Firefox for Android may install it, but
  touch selection and the toolbar have not been designed for it.
- The LinkedIn mobile apps cannot run extensions.
