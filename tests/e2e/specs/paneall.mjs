// Every kind of file a document can link to opens in the split view with its
// content, and the document stays on the left. Pictures and PDF open in a new
// tab instead, on purpose. One made-up file per kind, each with a marker.
import puppeteer from '../browser.mjs'
import { pathToFileURL } from 'node:url'
import fs from 'fs'
import path from 'path'
const [exe, ext, dir, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = pathToFileURL(dir).href
fs.mkdirSync(outDir, { recursive: true })
let pass = 0
let fail = 0
const ok = (c, m) => {
  c ? pass++ : fail++
  console.log(c ? 'PASS' : 'FAIL', m)
}

// what the split view must show for each file
const SHOWS = {
  'a.md': 'MARK-md',
  'a.txt': 'MARK-txt',
  'a.csv': 'MARK-csv',
  'a.tsv': 'MARK-tsv',
  'a.xlsx': 'MARK-xlsx',
  'a.docx': 'Sync service: design review',
  'a.pptx': 'Sync service 2.7',
  'a.mmd': 'MARK-mmd',
  'a.json': 'MARK-json',
  'a.jsonc': 'MARK-jsonc',
  'a.json5': 'MARK-json5',
  'a.jsonl': 'MARK-jsonl',
  'a.ndjson': 'MARK-ndjson',
  'a.geojson': 'MARK-geojson',
  'a.yml': 'MARK-yml',
  'a.yaml': 'MARK-yaml',
  'a.toml': 'MARK-toml',
  'a.ini': 'MARK-ini',
  'a.cfg': 'MARK-cfg',
  'a.conf': 'MARK-conf',
  'a.properties': 'MARK-properties',
  'a.env': 'MARK-env',
  'a.log': 'MARK-log',
  '.gitignore': 'MARK-gitignore',
  '.editorconfig': 'MARK-editorconfig',
  '.npmrc': 'MARK-npmrc',
  '.env.local': 'MARK-envlocal',
  Dockerfile: 'MARK-dockerfile',
  Makefile: 'MARK-makefile',
  LICENSE: 'MARK-license',
}
const NEW_TAB = ['pic.png', 'doc.pdf']

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(outDir, 'prof-')),
  ignoreDefaultArgs: ['--disable-extensions'],
  defaultViewport: { width: 1300, height: 800 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
  ],
})
const errors = []
try {
  const sw = await browser.waitForTarget(t => t.type() === 'service_worker', {
    timeout: 10000,
  })
  const id = new URL(sw.url()).host
  const opt = await browser.newPage()
  await opt.goto(`chrome-extension://${id}/options.html`)
  await opt.evaluate(() => chrome.storage.local.set({ tourDone: true }))
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/index.md`)
  await page.waitForSelector('.md-reader__markdown-content li a')
  await sleep(500)
  const linkTo = name =>
    `.md-reader__markdown-content a[href="${encodeURI(name)}"]`

  const missing = []
  for (const [name, says] of Object.entries(SHOWS)) {
    await page.click(linkTo(name))
    const shown = await page
      .waitForFunction(
        s =>
          (
            document.querySelector('.md-reader__preview')?.innerText || ''
          ).includes(s),
        { timeout: 6000 },
        says,
      )
      .then(() => true)
      .catch(() => false)
    if (!shown || !page.url().endsWith('/index.md')) missing.push(name)
  }
  ok(
    missing.length === 0,
    `${Object.keys(SHOWS).length} kinds in the split view, the document stays` +
      (missing.length ? '; not shown: ' + missing.join(' ') : ''),
  )
  await page.screenshot({ path: path.join(outDir, 'last-in-pane.png') })

  for (const name of NEW_TAB) {
    const tab = browser
      .waitForTarget(t => t.url().endsWith('/' + name), { timeout: 5000 })
      .catch(() => null)
    await page.click(linkTo(name))
    const t = await tab
    await sleep(400)
    ok(
      !!t && page.url().endsWith('/index.md'),
      `${name}: a new tab, not the split view`,
    )
    const p = t && (await t.page().catch(() => null))
    if (p) await p.close().catch(() => {})
  }
  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 2).join(' / '))
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
