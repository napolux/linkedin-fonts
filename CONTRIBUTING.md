# Contributing

Thanks for helping! Bug reports, LinkedIn breakage reports and pull requests
are all welcome.

## Reporting a bug

Please [open an issue](https://github.com/napolux/linkedin-fonts/issues) with:

- browser and version (e.g. Chrome 155, Firefox 145);
- where on LinkedIn it happened (new post, comment, messaging, profile…);
- what you selected, what you pressed, what you expected and what happened;
- if the text came out wrong, the code points: see
  [DOCS/development.md](DOCS/development.md#debugging).

## Development setup

```sh
npm install
npm run watch          # keep it running
npm run dev:firefox    # or dev:chrome, or open playground/index.html
```

Everything else is in [DOCS/development.md](DOCS/development.md). Read
[DOCS/architecture.md](DOCS/architecture.md) before changing anything in
`src/content/`.

## Ground rules

These keep the extension small, private and easy to review:

1. **No runtime dependencies.** Vanilla JavaScript and CSS only.
2. **No new permissions** and no network access. A change that needs either
   must be discussed in an issue first, because it changes the privacy
   policy and the store review.
3. **Do not depend on LinkedIn class names** when a standard DOM property or
   behaviour works.
4. **English** for code, comments, documentation and commit messages.
5. Keep `src/content/unicode.js` and `src/content/diff.js` free of DOM access.

## Pull request checklist

- [ ] `npm test` passes, and new logic in `unicode.js` / `diff.js` has unit tests.
- [ ] `npm run test:e2e` passes (needs Chrome and/or Firefox installed). DOM
      behaviour changes come with an end-to-end test on the playground.
- [ ] `npm run build && npm run lint` passes (ESLint and `web-ext lint`).
- [ ] Checked by hand on linkedin.com, in Chrome and in Firefox, for the
      fields you touched.
- [ ] `CHANGELOG.md` updated under `[Unreleased]`.
- [ ] Documentation in `DOCS/` updated if behaviour or structure changed.

## Commit messages

Short imperative subject line ("Fix toolbar position in messaging overlay"),
then a blank line and the *why* if it is not obvious.
