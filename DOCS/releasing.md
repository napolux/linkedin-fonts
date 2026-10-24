# Releasing

## Versioning

The project follows [Semantic Versioning](https://semver.org/). The **only**
place where the version lives is `package.json`. The build copies it into both
manifests.

Browsers only accept 1 to 4 dot-separated integers (`1.2.3`), so pre-release
tags such as `1.0.0-beta.1` are rejected by the build.

- **patch** (`0.1.1`): bug fixes, LinkedIn markup adaptations.
- **minor** (`0.2.0`): new features (new styles, new fields).
- **major** (`1.0.0`): breaking behaviour changes, new permissions.

## Release checklist

1. Make sure `main` is green: `npm test`, `npm run test:e2e`, `npm run build`, `npm run lint`.
2. Run the manual checklist on linkedin.com ([development.md](development.md#manual-checklist-on-linkedincom)).
3. Bump the version without creating a tag yet:
   ```sh
   npm version 0.2.0 --no-git-tag-version
   ```
4. Move the `[Unreleased]` entries of `CHANGELOG.md` under the new version and date.
5. Commit, tag and push:
   ```sh
   git commit -am "Release v0.2.0"
   git tag v0.2.0
   git push origin main v0.2.0
   ```
6. The **Release** workflow (`.github/workflows/release.yml`) checks that the tag
   matches `package.json`, runs the tests, builds and creates a GitHub Release
   with three files:
   - `linkedin-fonts-chrome-<version>.zip`: upload to the Chrome Web Store;
   - `linkedin-fonts-firefox-<version>.zip`: upload to addons.mozilla.org;
   - `linkedin-fonts-source-<version>.zip`: source code for the AMO review.

To build the same files locally: `npm run package && npm run package:source`
(the source archive is made from the committed `HEAD`).

## Chrome Web Store

Dashboard: <https://chrome.google.com/webstore/devconsole>

1. **New item** (or **Package → Upload new package** for an update), then
   upload `linkedin-fonts-chrome-<version>.zip`.
2. **Store listing**: description, at least one 1280×800 screenshot, the
   128×128 icon (`src/icons/icon-128.png`), category *Productivity*.
3. **Privacy practices**:
   - *Single purpose*: "Format the text the user writes on LinkedIn (bold,
     italic, underline) using Unicode characters."
   - *Permission justification*: the extension requests no permissions. Its
     content script runs on `https://www.linkedin.com/*` to show the
     formatting toolbar in LinkedIn text fields.
   - *Data usage*: no user data is collected. Tick the three certification boxes.
   - *Privacy policy URL*: link to [privacy.md](privacy.md) on GitHub.
4. Submit for review.

## Firefox Add-ons (AMO)

Developer Hub: <https://addons.mozilla.org/developers/>

1. **Submit a New Add-on** (or **Upload New Version**), *On this site*, then
   upload `linkedin-fonts-firefox-<version>.zip`. The add-on ID
   `linkedin-fonts@napolux.com` comes from the manifest.
2. Compatibility: Firefox (desktop). Only tick Firefox for Android after
   testing it there.
3. **Source code**: answer *Yes*, because the code is bundled and minified,
   and upload `linkedin-fonts-source-<version>.zip`. Build instructions for
   the reviewer:

   ```
   Requirements: Node.js 22+ and npm (any OS).
   npm ci
   npm run build:firefox
   The output in dist/firefox/ is identical to the submitted package.
   ```

4. Data collection: the manifest already declares
   `data_collection_permissions: { required: ["none"] }`.
5. Listing: summary, description, screenshots, category *Social &
   Communication*, privacy policy (link or paste [privacy.md](privacy.md)).

## Naming

Store policies forbid names that suggest an official product. "Fonts for
LinkedIn" uses the accepted "<feature> for <brand>" form. Keep the
non-affiliation notice in the store descriptions:

> This extension is not affiliated with, endorsed by or sponsored by LinkedIn Corporation.
