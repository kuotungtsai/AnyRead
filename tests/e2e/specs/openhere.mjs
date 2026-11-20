// "Open here" in the pane opens the file in this tab; Back returns.
// usage: node openhere.mjs <chrome.exe> <extension dir> <pane dir> <out dir>
import puppeteer from '../browser.mjs'
import { pathToFileURL } from 'node:url'
import fs from 'fs'
import path from 'path'

const [exe, ext, mdDir, outDir] = process.argv.slice(2)
const base = pathToFileURL(mdDir).href + '/'
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
  await page.goto(base + 'start.md')
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 10000,
  })
  await sleep(1200)
  if (await page.$('.mdr-tour-card')) await page.keyboard.press('Escape')
  await sleep(300)
  const a = (
    await page.evaluateHandle(() =>
      [...document.querySelectorAll('.md-reader__body a')].find(
        a => a.textContent.trim() === 'Alpha',
      ),
    )
  ).asElement()
  await a.click()
  await page.waitForSelector('.md-reader__preview h1', { timeout: 8000 })
  await sleep(600)

  const labels = await page.$$eval('.md-reader__preview-bar button', b =>
    b.map(x => x.textContent.trim()),
  )
  check(
    'bar has both open buttons',
    labels.includes('直接開啟') && labels.includes('在新分頁開啟'),
    labels.join(' | '),
  )
  await page.screenshot({
    path: path.join(outDir, 'openhere.png'),
    clip: { x: 600, y: 0, width: 800, height: 60 },
  })

  const tabsBefore = (await browser.pages()).length
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    page.click('.md-reader__preview-bar button[data-act="open-here"]'),
  ])
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 10000,
  })
  await sleep(800)
  check(
    'file opens in this tab',
    page.url().endsWith('docs/alpha.md'),
    page.url(),
  )
  const h1 = await page.$eval(
    '.md-reader__body > .md-reader__markdown-content h1',
    h => h.textContent.trim(),
  )
  check('shown as the main document', h1.includes('Alpha'), h1)
  check('no new tab', (await browser.pages()).length === tabsBefore)
  check(
    'pane closed',
    !(await page
      .$eval('.md-reader__preview', p => p.offsetParent !== null)
      .catch(() => false)),
  )

  await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.goBack()])
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 10000,
  })
  check(
    'browser Back returns to the first file',
    page.url().endsWith('start.md'),
    page.url(),
  )
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
process.exit(fails ? 1 : 0)
