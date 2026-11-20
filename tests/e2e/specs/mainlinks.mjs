// Links in the main document to other local files open a new tab; the document stays.
import puppeteer from '../browser.mjs'
import { pathToFileURL } from 'node:url'
import fs from 'fs'
import path from 'path'
const [exe, ext, dir, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = pathToFileURL(dir).href
fs.mkdirSync(outDir, { recursive: true })
let pass = 0,
  fail = 0
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
  defaultViewport: { width: 1200, height: 700 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
  ],
})
try {
  const sw = await browser.waitForTarget(t => t.type() === 'service_worker', {
    timeout: 10000,
  })
  const id = new URL(sw.url()).host
  const opt = await browser.newPage()
  await opt.goto(`chrome-extension://${id}/options.html`)
  await opt.evaluate(() => chrome.storage.local.set({ tourDone: true }))
  const page = await browser.newPage()
  const clickIn = async (sel, end) => {
    const tab = browser
      .waitForTarget(t => t.url().endsWith(end) && t !== page.target(), {
        timeout: 5000,
      })
      .catch(() => null)
    await page.click(sel)
    return tab
  }
  await page.goto(`${base}/links.md`)
  await page.waitForSelector('.md-reader__markdown-content a[href="pic.png"]')
  await sleep(400)
  for (const [href, end] of [
    ['pic.png', '/pic.png'],
    ['doc.pdf', '/doc.pdf'],
    ['sub/', '/sub/'],
  ]) {
    const t = await clickIn(
      `.md-reader__markdown-content a[href="${href}"]`,
      end,
    )
    await sleep(500)
    ok(
      !!t && page.url().endsWith('/links.md'),
      `${href}: new tab, the document stays`,
    )
    if (t) {
      const p = await t.page().catch(() => null)
      if (p) await p.close().catch(() => {})
    }
  }
  // a link to another site: a new tab, the document stays
  {
    const t = await clickIn(
      '.md-reader__markdown-content a[href^="http://127.0.0.1:9/"]',
      '/site',
    )
    await sleep(500)
    ok(
      !!t && page.url().endsWith('/links.md'),
      'outside site: new tab, the document stays',
    )
    if (t) {
      const p = await t.page().catch(() => null)
      if (p) await p.close().catch(() => {})
    }
  }
  // Markdown still opens in the pane; "#" stays a jump
  await page.click('.md-reader__markdown-content a[href="sub/s.md"]')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.md-reader__preview')
        ?.textContent.includes('Sub'),
    { timeout: 5000 },
  )
  ok(page.url().endsWith('/links.md'), 'Markdown link: the pane, as before')
  await page.click('.md-reader__markdown-content a[href="#links"]')
  await sleep(300)
  {
    const urls = (await browser.pages()).map(p => p.url().split('/').pop())
    ok(
      page.url().includes('/links.md') &&
        !urls.some(
          u => u.includes('#links') && u !== page.url().split('/').pop(),
        ),
      '#anchor: stays in the page ' +
        JSON.stringify({ url: page.url().split('/').pop(), urls }),
    )
  }
  // pane turned off: links behave as plain links
  await opt.evaluate(() => chrome.storage.local.set({ linkPreview: false }))
  await page.goto(`${base}/links.md`)
  await page.waitForSelector('.md-reader__markdown-content a[href="pic.png"]')
  await sleep(400)
  await page.click('.md-reader__markdown-content a[href="pic.png"]')
  await page
    .waitForFunction(() => location.href.endsWith('/pic.png'), {
      timeout: 5000,
    })
    .catch(() => {})
  ok(
    page.url().endsWith('/pic.png'),
    'with the pane turned off: a plain link (same tab)',
  )
  // an outside site still gets a tab of its own (not part of the pane)
  await page.goto(`${base}/links.md`)
  await page.waitForSelector('.md-reader__markdown-content a[href="pic.png"]')
  await sleep(400)
  {
    const t = await clickIn(
      '.md-reader__markdown-content a[href^="http://127.0.0.1:9/"]',
      '/site',
    )
    await sleep(500)
    ok(
      !!t && page.url().endsWith('/links.md'),
      'with the pane turned off: an outside site still opens a new tab',
    )
  }
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
