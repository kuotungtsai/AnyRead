/**
 * Browser tests: the built extension (extension/) in Chrome for Testing,
 * on made-up files written fresh into tests/e2e/.work/.
 *
 *   pnpm test:e2e                 every spec
 *   pnpm test:e2e folder office   only these
 *
 * Build first (pnpm build:extension). Chrome for Testing is downloaded once
 * into tests/e2e/.cache/, or set CHROME to a Chrome for Testing / Chromium
 * executable. A branded Chrome will not do: it no longer loads an unpacked
 * extension from the command line. The specs open real windows.
 *
 * Passing these is the minimum, not proof that a change works: see
 * tests/e2e/README.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId,
} from '@puppeteer/browsers'
import { makeFixtures } from './fixtures.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const ext = path.join(root, 'extension')
const work = path.join(here, '.work')
const cache = path.join(here, '.cache')
const out = name => path.join(work, 'out', name)
const w = name => path.join(work, name)

/** each spec, with the arguments it takes after the browser and the extension */
const SPECS = {
  anchors: () => [w('anchors'), out('anchors')], // GitHub-style #heading links
  closemd: () => [w('histtest'), out('closemd')], // Close (Esc) for a file in the folder page
  cols: () => [w('cols'), out('cols')], // the folder page's two columns
  csv: () => [w('csvtest')], // CSV / TSV / Excel in the pane and on the table page
  esc: () => [w('demo'), out('esc')], // Esc closes the split pane
  flash: () => [w(path.join('histtest', 'withreadme')), out('flash')], // no flash of Chrome's listing
  folder: () => [w('demo'), w('demo2'), out('folder')], // folder page: files, .txt, sub folders
  filesup: () => [w('demo'), out('filesup')], // the side bar's Files tab: ↑ stops at the drive
  filesdir: () => [w('demo'), out('filesdir')], // the Files tab: a folder's name opens its folder page
  hist: () => [w('histtest'), out('hist')], // Back / Forward on the folder page
  mainlinks: () => [w('linktest'), out('mainlinks')], // other local links open a new tab
  math: () => [w('mathtest'), out('math')], // $, $$, ```math and $`...`$ formulas
  office: () => [w('officetest'), out('office')], // Word and PowerPoint
  openhere: () => [w('pane'), out('openhere')], // the pane's "Open here"
  pane: () => [w('pane'), out('pane')], // the linked-file pane
  review: () => [w('demo'), w('bigtest'), out('review')], // other pages' frames, size limits, theme
  settings: () => [out('settings')], // the settings file
  sidehide: () => [w('histtest'), out('sidehide')], // web links, hiding the left column
}

async function chromePath() {
  if (process.env.CHROME) return process.env.CHROME
  const installed = (await getInstalledBrowsers({ cacheDir: cache }))
    .filter(b => b.browser === Browser.CHROME)
    .sort((a, b) =>
      b.buildId.localeCompare(a.buildId, undefined, { numeric: true }),
    )
  if (installed.length) return installed[0].executablePath
  const platform = detectBrowserPlatform()
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable')
  console.log(
    `Downloading Chrome for Testing ${buildId} into tests/e2e/.cache (once)...`,
  )
  await install({ browser: Browser.CHROME, buildId, cacheDir: cache })
  return computeExecutablePath({
    browser: Browser.CHROME,
    buildId,
    cacheDir: cache,
  })
}

const wanted = process.argv.slice(2)
const unknown = wanted.filter(n => !SPECS[n])
if (unknown.length) {
  console.error(
    `No such spec: ${unknown.join(', ')}. Specs: ${Object.keys(SPECS).join(
      ', ',
    )}`,
  )
  process.exit(2)
}
if (!fs.existsSync(path.join(ext, 'manifest.json'))) {
  console.error('No build in extension/. Run `pnpm build:extension` first.')
  process.exit(2)
}

const exe = await chromePath()
makeFixtures(work)
fs.mkdirSync(path.join(work, 'out'), { recursive: true })

const results = []
for (const name of wanted.length ? wanted : Object.keys(SPECS)) {
  console.log(`\n=== ${name}`)
  fs.mkdirSync(out(name), { recursive: true })
  const run = spawnSync(
    process.execPath,
    [path.join(here, 'specs', `${name}.mjs`), exe, ext, ...SPECS[name]()],
    { cwd: here, encoding: 'utf8', timeout: 5 * 60 * 1000 },
  )
  const text = (run.stdout || '') + (run.stderr || '')
  process.stdout.write(text)
  if (run.error?.code === 'ETIMEDOUT') {
    console.log(`FAIL ${name} timed out after 5 minutes`)
  }
  // a spec prints "PASS ..." / "FAIL ..." lines and a summary
  const failed =
    run.status !== 0 ||
    /^FAIL\b/m.test(text) ||
    !/(passed \d+, failed 0|ALL PASS)/.test(text)
  results.push({ name, failed })
}

console.log('\n=== summary')
for (const r of results) console.log(`${r.failed ? 'FAIL' : 'ok  '} ${r.name}`)
const bad = results.filter(r => r.failed).length
console.log(
  bad
    ? `${bad} of ${results.length} specs failed`
    : `all ${results.length} specs passed`,
)
console.log(
  `screenshots and downloads: ${path.relative(root, path.join(work, 'out'))}`,
)
process.exit(bad ? 1 : 0)
