# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - Not yet published

### Added

- Floating B / I / U toolbar on text selections in LinkedIn fields: posts,
  comments, messages (contenteditable), textareas and text inputs.
- Bold, italic and bold italic with Unicode sans-serif Mathematical
  Alphanumeric Symbols. Underline with U+0332 COMBINING LOW LINE.
- Stackable styles: the toolbar stays open while the text is selected, and
  pressing an active style removes it.
- Accented Latin letters supported through Unicode decomposition, with exact
  round trip back to plain text.
- Recognition of serif bold / italic / bold italic text from other tools.
- Keyboard shortcuts: Ctrl+B / Ctrl+I / Ctrl+U (⌘ on macOS) when text is
  selected in a LinkedIn field.
- Light and dark toolbar themes, detected from the page's actual background.
- Native undo support through `execCommand`.
- Chrome (MV3, Chrome 120+) and Firefox (MV3, Firefox 140+) builds from a
  single code base. No permissions, no data collection.
- Unit tests, end-to-end tests in headless Chrome and Firefox, CI and release workflows.

[Unreleased]: https://github.com/napolux/linkedin-fonts/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/napolux/linkedin-fonts/releases/tag/v0.1.0
