# Browser tests

The built extension (`extension/`) loaded into Chrome for Testing, driven by
[puppeteer-core](https://pptr.dev/), on made-up files.

```bash
npx pnpm@9 build:extension      # the tests use what is built
npx pnpm@9 test:e2e             # every spec
npx pnpm@9 test:e2e csv office  # only these
```

- **Chrome**: Chrome for Testing is downloaded once into `.cache/` (about
  150 MB, needs the network once). To use another one, set `CHROME` to a
  Chrome for Testing or Chromium executable. A branded Chrome does not work:
  it no longer loads an unpacked extension from the command line.
- **Windows**: the specs open real browser windows; leave them alone while
  they run (a few minutes in all).
- **Files**: `fixtures.mjs` writes invented files into `.work/` before every
  run (the tests change some of them). Screenshots and downloads go to
  `.work/out/`. Both folders are ignored by git.
- **Result**: each spec prints `PASS` / `FAIL` lines; `run.mjs` prints a
  summary and exits with 1 when a spec failed.

## Other systems

The specs have been run on Windows. Everything a machine may need is set
from outside, without changing the specs (`browser.mjs` applies it):

| Need                                          | Set                                                        |
| --------------------------------------------- | ---------------------------------------------------------- |
| No display (a server, a Pi)                   | `E2E_HEADLESS=1` (new headless mode loads extensions)      |
| The system blocks Chromium's sandbox          | `E2E_NO_SANDBOX=1` (Ubuntu's AppArmor can do this)         |
| No Chrome for Testing build for this platform | `CHROME=/path/to/chromium` (there is none for linux-arm64) |
| More Chrome flags                             | `E2E_CHROME_ARGS="--flag-one --flag-two"`                  |

The interface language is always Traditional Chinese (the specs compare
texts), set both with `--lang` and with `LANGUAGE` / `LANG`, so the
computer's own language does not matter. File addresses are built with
`pathToFileURL`, so Linux and macOS paths work too.

```bash
E2E_HEADLESS=1 E2E_NO_SANDBOX=1 CHROME=/usr/lib/chromium/chromium npx pnpm@9 test:e2e
```

**Known:** on a Raspberry Pi (linux-arm64) with a Playwright Chromium,
puppeteer's mouse clicks did not reach the table page's Close button inside
the folder page, so `cols`, `hist` and `office` failed there. Clicking with
Playwright, or calling the button's `click()`, worked: the feature is fine,
the clicks are not. The specs keep real clicks on purpose.

## The specs

| Spec        | What it checks                                                                 |
| ----------- | ------------------------------------------------------------------------------ |
| `pane`      | linked Markdown opens in the pane; back / forward; new tab                     |
| `openhere`  | the pane's "Open here" and the browser's Back                                  |
| `anchors`   | `#heading` links written for GitHub; file names not turned into links          |
| `esc`       | Esc closes the pane, also from the folder page's tree                          |
| `csv`       | CSV / TSV / Excel in the pane and on the table page; encodings; Download       |
| `review`    | other pages' frames left alone; size limits; the folder page's live theme      |
| `settings`  | saving and restoring the settings file                                         |
| `folder`    | the folder page: files, `.txt`, tables, diagrams, sub folders, Close           |
| `cols`      | the two columns: down, up, ▸, breadcrumb, Back; the drive root (Windows only)  |
| `hist`      | Back / Forward through the folder page, a late page after a quick Back         |
| `closemd`   | Close (Esc) for a file in the folder page; Esc with the pane or edit mode open |
| `sidehide`  | web links open a new tab; hiding the left column                               |
| `flash`     | no flash of Chrome's own listing on reload                                     |
| `office`    | Word and PowerPoint in the pane, the table page and the folder page            |
| `mainlinks` | links to other local files open a new tab and keep the document                |

## Writing a spec

Copy a short one (`mainlinks.mjs`, `sidehide.mjs`): it gets the browser and
the extension as its first two arguments, then the folders `run.mjs` lists
for it in `SPECS`. Add any files it needs to `fixtures.mjs` (invented
content only), and the spec to `SPECS` and to the table above.

Before trusting a new spec, see it fail: run it against the code before
your change, or break the code on purpose. A spec that cannot fail checks
nothing.

## What these tests do not cover

Passing them is the minimum, not proof that a change works. Not covered:

- **Real Office files.** The Word, PowerPoint and Excel files here are small
  hand-made ones. Files saved by Word, PowerPoint or Excel are far richer;
  try real ones by hand (and do not commit them).
- **Web sites.** Markdown on http(s) sites and the site permission prompts.
- **macOS and Linux.** The specs have been run on Windows.
- **The store version.** Installing from the Chrome Web Store, updates, and
  the welcome page after install.
- **Looks.** Specs check structure, not appearance: look at the pages (both
  themes) when you change anything visible.
