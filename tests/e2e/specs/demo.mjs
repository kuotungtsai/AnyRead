// The demo (tests/e2e/demo.mjs, what `pnpm demo` writes) works end to end:
// every file its README links to opens in the split view with content and
// no error, pictures and PDF in a new tab, folders as the folder page; the
// folder page shows its hidden folder with "Show hidden files".
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
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(outDir, 'prof-')),
  ignoreDefaultArgs: ['--disable-extensions'],
  defaultViewport: { width: 1300, height: 850 },
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
  await opt.evaluate(() =>
    chrome.storage.local.set({ tourDone: true, pageTheme: 'light' }),
  )
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/README.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await sleep(800)
  await page.screenshot({ path: path.join(outDir, 'readme.png') })

  // the README's local links, sorted by what they should do
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__markdown-content a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => !/^(https?:|mailto:|#)/.test(h)),
  )
  const newTab = links.filter(h => /\.(svg|pdf)$/i.test(h))
  const folders = links.filter(h => h.endsWith('/'))
  const pane = links.filter(h => !newTab.includes(h) && !folders.includes(h))
  ok(pane.length >= 20, `${pane.length} files to open in the split view`)

  const bad = []
  for (const href of pane) {
    await page.click(`.md-reader__markdown-content a[href="${href}"]`)
    const shown = await page
      .waitForFunction(
        () => {
          const p = document.querySelector('.md-reader__preview')
          if (!p || getComputedStyle(p).display === 'none') return false
          const body = p.querySelector('article') || p
          // loaded: something drawn, not the loading line
          return (
            body.querySelector(
              'svg, table, pre, h1, h2, p, li, .anyread-office',
            ) && body.innerText.trim().length > 0
          )
        },
        { timeout: 8000 },
      )
      .then(() => true)
      .catch(() => false)
    const err = await page.evaluate(
      () =>
        !!document.querySelector(
          '.md-reader__preview .katex-error, .md-reader__preview .anyread-error',
        ),
    )
    if (!shown || err || !page.url().endsWith('/README.md')) bad.push(href)
  }
  ok(
    bad.length === 0,
    'every file opens in the split view with content' +
      (bad.length ? '; not: ' + bad.join(' ') : ''),
  )
  await page.screenshot({ path: path.join(outDir, 'last-in-pane.png') })

  for (const href of newTab) {
    const t = browser
      .waitForTarget(x => x.url().endsWith(href.split('/').pop()), {
        timeout: 5000,
      })
      .catch(() => null)
    await page.click(`.md-reader__markdown-content a[href="${href}"]`)
    const tab = await t
    await sleep(300)
    ok(!!tab && page.url().endsWith('/README.md'), `${href}: a new tab`)
    const p = tab && (await tab.page().catch(() => null))
    if (p) await p.close().catch(() => {})
  }

  // a folder link: its folder page, in a new tab (links to other local
  // files keep the document)
  for (const href of folders) {
    await page.goto(`${base}/README.md`)
    await page.waitForSelector('.md-reader__markdown-content h1')
    await sleep(300)
    const t = browser
      .waitForTarget(x => x.url().endsWith('/' + href), { timeout: 5000 })
      .catch(() => null)
    await page.click(`.md-reader__markdown-content a[href="${href}"]`)
    const tab = await t
    const p = tab && (await tab.page().catch(() => null))
    const opened = p
      ? await p
          .waitForSelector('.mdr-app', { timeout: 8000 })
          .then(() => true)
          .catch(() => false)
      : false
    ok(
      opened && page.url().endsWith('/README.md'),
      `${href}: its folder page in a new tab, the guide stays`,
    )
    if (p) await p.close().catch(() => {})
  }

  // the folder page of the whole demo, and its hidden folder
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-list a', { timeout: 8000 })
  const names = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.mdr-list a .mdr-name')].map(
        a => a.textContent,
      ),
    )
  let n = await names()
  ok(
    n.includes('README.md') && n.includes('data') && !n.includes('.drafts'),
    'folder page lists the demo, the hidden folder not yet',
  )
  await page.click('.mdr-bar input[data-opt="hidden"]')
  await sleep(800)
  n = await names()
  ok(n.includes('.drafts'), '"Show hidden files": .drafts listed')
  await page.screenshot({ path: path.join(outDir, 'folder.png') })
  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 2).join(' / '))
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
