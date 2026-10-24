# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The toolbar was invisible (and would not have been clickable) in editors
  inside modal dialogs, such as "Start a post" and the profile forms: they
  live in the browser's top layer. The toolbar is now a popover attached
  inside the dialog or popover that contains the field.

### Changed

- Less work on every keystroke while typing: no refresh on `keyup` unless a
  selection is being made or the toolbar is visible, and no DOM writes when
  the toolbar is already hidden.

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
- Keyboard shortcuts when text is selected in a LinkedIn field: ⌘B / ⌘I / ⌘U
  on macOS, Ctrl+B / Ctrl+I / Ctrl+U on Windows and Linux. The other
  platform's modifier is never intercepted.
- Light and dark toolbar themes, detected from the page's actual background.
- Native undo support through `execCommand`.
- Chrome (MV3, Chrome 120+) and Firefox (MV3, Firefox 140+) builds from a
  single code base. No permissions, no data collection.
- Unit tests, end-to-end tests in headless Chrome and Firefox, CI and release workflows.

[Unreleased]: https://github.com/napolux/linkedin-fonts/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/napolux/linkedin-fonts/releases/tag/v0.1.0
