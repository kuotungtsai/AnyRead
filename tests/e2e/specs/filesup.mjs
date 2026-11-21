// The side bar's Files tab: ↑ goes up folder by folder and stops at the top
// of the drive (Windows) or at / (Linux, macOS) with something listed, the
// button then greyed out; it never ends on an empty, unlisted address.
// Checks structure only and prints no file names of the computer.
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
  defaultViewport: { width: 1100, height: 800 },
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
  await page.goto(`${base}/README.md`)
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 8000,
  })
  await page.evaluate(() =>
    document.querySelectorAll('.md-reader__side-tab')[1].click(),
  )
  await page.waitForSelector('.md-reader__files-up', { timeout: 5000 })
  const state = () =>
    page.evaluate(() => ({
      title: document.querySelector('.md-reader__files-title')?.title || '',
      items: document.querySelectorAll('.md-reader__files-list li').length,
      disabled: !!document.querySelector('.md-reader__files-up')?.disabled,
    }))
  // up until the button is greyed out (the fixtures sit a few folders deep)
  let s = await state()
  const seen = []
  for (let i = 0; i < 25 && !s.disabled; i++) {
    await page.click('.md-reader__files-up')
    await sleep(700)
    s = await state()
    seen.push(s.title === 'file:///' ? 'ROOT' : s.title.length ? 'folder' : '?')
  }
  ok(
    s.disabled,
    '↑ is greyed out at the top: ' + JSON.stringify(seen.slice(-3)),
  )
  if (process.platform === 'win32') {
    ok(
      /^file:\/\/\/[A-Za-z]:\/$/.test(s.title),
      'Windows: stops at the drive, not file:///',
    )
  } else {
    ok(s.title === 'file:///', 'Linux / macOS: goes up to /')
  }
  ok(s.items > 0, 'something is listed at the top (' + s.items + ' items)')
  // greyed out means a click does nothing
  await page.click('.md-reader__files-up').catch(() => {})
  await sleep(500)
  const after = await state()
  ok(
    after.title === s.title && after.items === s.items,
    'another ↑ changes nothing',
  )
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
