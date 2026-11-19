English | [繁體中文](../../README.md)

# AnyRead MD

<img alt="AnyRead MD" src="../../src/images/icon.svg" align="right" width="110">

A Chrome extension to read, browse and edit Markdown files.
Everything is handled on your computer: **no account, no tracking, and no connection to any outside server.**

> Fork of the open-source [md-reader](https://github.com/md-reader/md-reader) 2.x (MIT).

## Features

- **Reading**: local Markdown files (`.md`, `.markdown` and so on) are shown laid out, with light and dark themes, highlighted code, and pictures you can click to enlarge. Markdown files on web sites are left alone until you turn that on (see "Web site access" below).
- **Links open on the right**: a link in the document to another Markdown file, a `.txt` file or a code file type you added in Settings (such as `.py`) opens in the right half of the window, and your document stays on the left. Links clicked on the right keep opening on the right; ← → at the top go back and forward (so do the mouse side buttons). "Open here" opens the right-hand file in this tab (in place of the document on the left; the browser's Back button returns), and "Open in a new tab" opens it in a new tab. Links to other files (pictures, PDF and so on) open in a new tab and do not replace your document. Drag the divider to change the widths (remembered); double-click it to split evenly again. `Esc` closes the right side. Hold `Ctrl` while clicking to open a link the usual way. Can be turned off in Settings.
- **CSV and Excel tables**: Chrome downloads `.csv` and `.xlsx` files instead of showing them. Links to CSV, TSV and Excel (`.xlsx`, `.xlsm`) files show a table on the right. "Open here", "Open in a new tab", the folder view and the Files tab open the AnyRead MD table page, with a Download button that saves the original file.
  - CSV: comma, semicolon and tab delimiters are detected. Files that are not UTF-8 (such as Big5 saved by Excel) are read in the usual encoding for the interface language.
  - Excel: one tab per sheet. Cell values are shown, with dates, times and percentages formatted as in Excel; other formatting (currency signs, colours, merged cells, charts) is not. Formulas show the result Excel saved with the file. The older `.xls` is not supported. Files are read inside the browser, with no outside service or library.
  - The table page shows up to 10,000 rows and the right side 1,000. A file that is too large is not read in full; a short message says so instead (20 MB on the right side, 100 MB on the table page; an `.xlsx` sheet that unpacks to more than 64 MB). Opening a `.csv` or `.xlsx` from the address bar is still a download; an extension cannot change that.
- **Word and PowerPoint**: Chrome downloads `.docx` and `.pptx` files too. Links to them show their content on the right; "Open in a new tab", the folder view and the Files tab open them on the table page (with Download). The content only, not the layout:
  - Word: headings, paragraphs, bold / italic / underline, bulleted and numbered lists, tables, links, pictures and footnotes. Headers and footers, text boxes, shapes, charts, comments and tracked changes are not shown.
  - PowerPoint: one block per slide, in order: the title, the text (with its levels), tables, pictures and the speaker notes; hidden slides are marked. Slide layout, backgrounds, themes, shapes, charts and animations are not reproduced.
  - Files are read inside the browser, with no added library. The older `.doc` and `.ppt` are not supported.
- **Mermaid files**: `.mmd` and `.mermaid` files are drawn as diagrams, also on the right side, even with the Mermaid plugin turned off in Settings. ` ```mermaid ` blocks in Markdown documents are still handled by the Mermaid plugin.
- **Export**: the export button at the top right can "Print / Save as PDF" or save a single HTML file (styles, pictures and math fonts included in the file).
- **Reading settings**: font size, content width and line height in Settings, and your own CSS.
- **Side bar "Outline / Files"**: the outline jumps to headings; the Files tab lists the other Markdown files and subfolders in the same folder, one click to switch.
- **Folder view**: drag a whole folder into an ordinary Chrome tab (not onto `chrome://extensions`, where it would be taken as an extension to install), or open an address such as `file:///C:/docs/`. The main column lists the folder: type to filter, `↑` `↓` to choose, `Enter` to open; tick "Search inside files" to search the text of every Markdown file in the folder (and three levels of subfolders). The left column lists the folder above, with the current folder marked; `▸` opens a subfolder in place, and "Parent folder" at the top moves both columns up one level. A folder clicked in the main column opens one level down, and the left column becomes the level you were on; a folder clicked on the left opens in the main column and the left stays. At the top of a drive (such as `Z:`) the drive itself is on the left and the main column waits for you to pick something. `«` at the top of the left column hides it, for a wider main column (remembered); `»` brings it back. Files (Markdown, `.txt`, CSV, Excel, `.mmd`, pictures, PDF) open in the main column, without leaving the page; links in them open the split view as usual, and links to web sites open in a new tab; the ✕ "Close" button at the top right, or `Esc`, goes back to the file list (with the split view open, `Esc` closes that first). The browser's Back and Forward step through it all. `Ctrl`+click a file to open it in a new tab.
- **`.txt` files**: a `.txt` opened directly is laid out as Markdown too, with the outline, side bar and edit mode. Line breaks are kept, and `<...>` and quotes are shown as written, not taken as HTML or turned into curly quotes.
- **Edit mode**: `Alt+Shift+E` opens a side-by-side editor with a live preview on the right; `Ctrl+S` saves (the first time a "Save as" dialog opens: pick the same file to overwrite it). A formatting toolbar sits at the top (bold, lists, tables and more; `Ctrl+B` / `Ctrl+I` / `Ctrl+K`). When you paste a picture, you are asked to save it next to the document, and the picture syntax is inserted for you.
- **Plugins and their options**: Emoji, sub/superscript, table of contents, KaTeX math, Mermaid, footnotes, task lists, callouts, extended tables, frontmatter and more, each with its own switch and ⚙ JSON options; or turn them all on or off at once.
- **Settings file**: at the bottom of the settings page, "Save settings to a file" (JSON) and, on another computer, "Restore from a file". The file holds only settings (theme, plugins and options, extra file types, reading settings, custom CSS and so on), not your recent files; allowed web sites are not in it either and need to be allowed again on the new computer. Restoring takes only entries it knows and that are valid; the rest are listed and skipped.
- **Auto refresh**: the page updates when the file is saved in another editor.
- **Recent files**: the toolbar popup lists files you opened recently (kept only on this computer; can be turned off in Settings).
- **Copy a section link**: hover over a heading to see `#`; click it to copy a link to that section.
- **Interface languages**: English, 繁體中文, 简体中文, 日本語, 한국어.
- **Quick guide**: a welcome page after installing, a tour the first time you open a Markdown file, and a way to see it again from the popup.

### Shortcuts

| Shortcut                  | What it does                  |
| ------------------------- | ----------------------------- |
| `Alt+Shift+E`             | Edit mode on / off            |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save as (in edit mode) |
| `Alt+Shift+B`             | Show / hide the side bar      |
| `Alt+Shift+C`             | Center the content            |
| `Alt+Shift+R`             | Auto refresh                  |
| `Alt+Shift+T`             | Switch theme                  |
| `Esc`                     | Close the right side          |

### Web site access

After installing, only local files are handled; the extension does not ask to "read all your data on all web sites". To read Markdown files on web sites, turn it on in one of two ways:

- **One site**: open a Markdown file on that site, click the MD icon in the toolbar, and choose "Show this site with AnyRead MD".
- **All sites**: in Settings, under "Web sites", turn on "Markdown files on all web sites".

Either way Chrome asks you to confirm, and you can remove the access later in Settings.

## Installing

### From the zip file

1. Unpack `anyread-md-<version>.zip` to a place it can stay, such as `D:\tools\anyread-md` (do not delete or move it afterwards).
2. Go to `chrome://extensions` and turn on "Developer mode" at the top right.
3. Click "Load unpacked" and choose the unpacked folder, the one with `manifest.json` in it.
4. A welcome page opens after installing. Follow it to turn on "**Allow access to file URLs**"; local `.md` files are shown laid out only after that.

To update, unpack the new version over the old folder, then click Reload ↻ in `chrome://extensions`. Your settings are kept.
The `安裝說明.txt` file in the zip has fuller instructions and common questions (in Chinese).

### Building from source

Needs Node.js 16 or later.

```bash
# Install the dependencies at the versions locked in pnpm-lock.yaml (nothing newer)
npx pnpm@9 install --frozen-lockfile

# Build into the extension/ folder, then choose extension/ with "Load unpacked"
npx webpack --config ./build/webpack.prod.js

# Development mode (rebuilds on save)
npx pnpm@9 run dev

# Run the unit tests
npx pnpm@9 test

# Build and pack the zip to share: dist/anyread-md-<version>.zip
npx pnpm@9 run pack:share

# Build and pack the zip for the Chrome Web Store: dist/anyread-md-<version>-store.zip
npx pnpm@9 run pack:store
```

When a version tag (such as `v1.1.0`, matching the version in `package.json`) is pushed to GitHub, [GitHub Actions](../../.github/workflows/build.yml) runs the tests, builds, and attaches both zip files to a Release.

The texts, permission notes and pictures for the store listing are in [store/listing.md](../../store/listing.md); the privacy policy is in [PRIVACY.md](../../PRIVACY.md).

### Version numbers

AnyRead MD has its own version numbers, starting at 1.0.0, following [Semantic Versioning](https://semver.org/) (major.minor.patch). It does not continue md-reader's 2.x numbers.

- Change the version only in `version` in `package.json`; `pnpm run build` (`build:manifest`) writes it into `version` in `src/manifest.json`.
- The version shown in the extension is just `version` (such as `1.0.1`). The upstream version it is based on is recorded in `upstreamVersion` in `package.json`, for the record only; update it when merging a new upstream version. Credit to the original is in `LICENSE`, `THIRD_PARTY_NOTICES.txt`, the manifest's `author` and the README.
- For reference: 1.0.0 = md-reader 2.12.12 + the folder tree, edit mode, plugin settings, the folder view, and upgraded dependencies (mermaid 11, markdown-it 15, KaTeX 0.18, Svelte 5). The 2.13.0 before it is the same code with a different version number.

Before a new release, raise `version` in `package.json` so versions can be told apart. `pnpm run build` updates the manifest's version, builds, and packs `dist/anyread-md-<version>.zip` (the same zip as `pack:share`). `pack:share` alone does not update the manifest, so run `pnpm run build` (or `pnpm run build:manifest`) once first, or the zip file name keeps the old version.

### Releasing

When a tag starting with `v` (such as `v1.1.2`) is pushed, GitHub Actions builds both zip files and creates a GitHub Release with the same name.

- The Release text comes from `release-notes/<tag>.md` (such as `release-notes/v1.1.2.md`); write and commit it before tagging. See [release-notes/v1.1.1.md](../../release-notes/v1.1.1.md) for the layout: "New", "Fixed", "Downloads", then the same in English.
- Without that file, GitHub's own generated notes are used; those list only merged pull requests and are usually incomplete.
- The tag must match the version in `package.json`, or the build fails.

## Project layout

| Path                        | Contents                                                       |
| --------------------------- | -------------------------------------------------------------- |
| `src/main.ts`               | The Markdown page (rendering, side bar, buttons, auto refresh) |
| `src/core/markdown.ts`      | markdown-it setup, plugins and options, frontmatter            |
| `src/core/files.ts`         | The folder tree in the side bar's Files tab                    |
| `src/dir-frame.ts`          | Reads Chrome's `file://` folder listing; the folder view page  |
| `src/core/editor.ts`        | Edit mode and saving                                           |
| `src/core/preview.ts`       | Linked files opened in the right half                          |
| `src/core/table.ts`         | CSV / TSV parsing, encoding detection                          |
| `src/core/settings-file.ts` | Settings file export and import checks                         |
| `src/core/xlsx.ts`          | Reads Excel `.xlsx` (no library)                               |
| `src/core/zip.ts`           | Reads zip files (Office files) with the browser's own unzip    |
| `src/core/office.ts`        | Reads the content of Word `.docx` and PowerPoint `.pptx`       |
| `src/core/office-view.ts`   | Shows Word / PowerPoint content                                |
| `src/table/`                | The table page: CSV, Excel, Word, PowerPoint (with Download)   |
| `src/core/export.ts`        | Export to PDF / HTML                                           |
| `src/core/web-access.ts`    | Web site access (turned on by you)                             |
| `tests/`                    | Unit tests (`pnpm test`)                                       |
| `src/core/tour.ts`          | The tour shown the first time                                  |
| `src/core/runtime.ts`       | Handling open tabs after the extension updates                 |
| `src/options/`              | Settings page, welcome page                                    |
| `src/popup/`                | Toolbar popup                                                  |
| `scripts/pack-share.mjs`    | Packs the zip to share                                         |
| `share/安裝說明.txt`        | Installation notes (in Chinese) put into the zip               |

## Privacy

- No data is collected or uploaded; no analytics, tracking or accounts.
- After installing, the extension has access to no web site; only sites you turn on yourself are handled.
- The only network requests are: reading again the Markdown address you are viewing (for auto refresh), reading files on the same site that links you click point to (Markdown, CSV, Excel, Word, PowerPoint, text, Mermaid; for the right side and the table page), and remote pictures and links in the document (loaded by the browser itself).
- The recent files list is kept only on your computer, and can be cleared or turned off.
- A settings file is kept only where you save it, and holds only settings, not your recent files.
- Local files are rendered only inside the browser. The folder listing is read from Chrome's own `file://` listing page, and the result goes back only to the same tab.

## License and credits

This project is a modified version of the open-source [md-reader](https://github.com/md-reader/md-reader) 2.x (Copyright (c) 2018-present Bener), released under the MIT License; see [LICENSE](../../LICENSE).

The third-party packages bundled into the extension (markdown-it, mermaid, KaTeX, Shiki, Graphviz and others) have their own licenses, all permissive ones such as MIT, ISC and BSD (Graphviz is EPL-1.0; DOMPurify is MPL-2.0 or Apache-2.0, your choice). Their copyright and license texts are collected at build time into `extension/THIRD_PARTY_NOTICES.txt`, which ships with the extension.

- The collecting code is in [build/third-party-notices.js](../../build/third-party-notices.js): it scans the `node_modules` modules actually bundled, so there is no list to keep by hand.
- Code compiled in from packages that ship no license file (such as Graphviz and Expat inside `@viz-js/viz`) is added by hand in [build/notices-supplements.js](../../build/notices-supplements.js); check it when upgrading viz-js.
- When adding a dependency, use only permissive licenses (MIT, ISC, BSD, Apache-2.0); do not add GPL, LGPL or AGPL packages.

This is an independently maintained modified version, not connected with the original author; please do not report its issues to the original project.
