// Auto links and GitHub-style #heading links, main page and pane.
// usage: node anchors.mjs <chrome.exe> <extension dir> <anchors dir> <out dir>
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const [exe, ext, mdDir, outDir] = process.argv.slice(2)
const base = 'file:///' + mdDir.replace(/\\/g, '/') + '/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0
const check = (name, ok, detail = '') => {
  if (!ok) fails++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`,
  )
}

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(outDir, 'prof-')),
  ignoreDefaultArgs: ['--disable-extensions'],
  defaultViewport: { width: 1400, height: 900 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
    '--window-size=1420,1000',
  ],
})

try {
  const sw = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().includes('background'),
    { timeout: 15000 },
  )
  const extId = new URL(sw.url()).host
  const extPage = await browser.newPage()
  await extPage.goto('chrome://extensions/')
  await extPage.evaluate(
    id =>
      chrome.developerPrivate.updateExtensionConfiguration({
        extensionId: id,
        fileAccess: true,
      }),
    extId,
  )
  await sleep(1500)
  await extPage.close()

  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base + 'main.md')
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 10000,
  })
  await sleep(1500)
  if (await page.$('.mdr-tour-card')) await page.keyboard.press('Escape')
  await sleep(300)

  const links = await page.$$eval(
    '.md-reader__body > .md-reader__markdown-content a:not(.md-reader__head-anchor)',
    l => l.map(a => a.textContent.trim()),
  )
  check(
    'local.mk is plain text',
    !links.includes('local.mk'),
    links.join(' | '),
  )
  check('setup.py is plain text', !links.includes('setup.py'))
  check('www.example.com still a link', links.includes('www.example.com'))
  check(
    'https://example.com still a link',
    links.includes('https://example.com'),
  )

  const linkByText = async (scope, text) =>
    (
      await page.evaluateHandle(
        (s, t) =>
          [...document.querySelectorAll(s + ' a')].find(
            a => a.textContent.trim() === t,
          ),
        scope,
        text,
      )
    ).asElement()

  // main page: GitHub-style #link scrolls to its heading
  const h2Top = () =>
    page.$eval('.md-reader__body > .md-reader__markdown-content h2', h =>
      Math.round(h.getBoundingClientRect().top),
    )
  const before = await h2Top()
  await (
    await linkByText(
      '.md-reader__body > .md-reader__markdown-content',
      '設定檔與 local.mk',
    )
  ).click()
  await sleep(800)
  const after = await h2Top()
  check(
    'main page #link jumps to the heading',
    before > 900 && after >= -5 && after < 200,
    `${before} → ${after}`,
  )
  check(
    'main page address has the heading id',
    decodeURIComponent(page.url()).includes('#設定檔與-local.mk'),
    decodeURIComponent(page.url()),
  )

  // opening the file with a GitHub-style hash
  await page.goto(base + 'main.md#' + encodeURIComponent('設定檔與-localmk'))
  await page.waitForSelector('.md-reader__markdown-content h2', {
    timeout: 10000,
  })
  await sleep(1500)
  const loadTop = await h2Top()
  check(
    'opening file#github-anchor scrolls there',
    loadTop >= -5 && loadTop < 200,
    String(loadTop),
  )

  // pane: same-file #link
  await page.evaluate(() => window.scrollTo(0, 0))
  await (
    await linkByText('.md-reader__body > .md-reader__markdown-content', '說明')
  ).click()
  await page.waitForSelector('.md-reader__preview h1', { timeout: 8000 })
  await sleep(800)
  const paneH2 = () =>
    page.$eval('.md-reader__preview h2', h =>
      Math.round(h.getBoundingClientRect().top),
    )
  const p0 = await paneH2()
  await (
    await linkByText('.md-reader__preview', '平台設定檔與 local.mk')
  ).click()
  await sleep(800)
  const p1 = await paneH2()
  check(
    'pane #link jumps to the heading',
    p0 > 900 && p1 >= 0 && p1 < 200,
    `${p0} → ${p1}`,
  )
  check(
    'pane heading text has no auto link',
    !(await page.$eval('.md-reader__preview h2', h => !!h.querySelector('a'))),
  )
  check('main page untouched', page.url().includes('main.md'), page.url())
  await page.screenshot({ path: path.join(outDir, 'anchors.png') })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
process.exit(fails ? 1 : 0)
