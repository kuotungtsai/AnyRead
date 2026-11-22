// Esc for a picture or a PDF on the right of the folder page. Chrome shows
// these itself (no AnyRead page inside), so the folder page and a small
// script in the picture must handle Esc.
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
const waitFor = async (fn, n = 25) => {
  for (let i = 0; i < n; i++) {
    if (await fn().catch(() => false)) return true
    await sleep(200)
  }
  return false
}
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
    '--lang=zh-TW',
  ],
  env: { ...process.env, LANGUAGE: 'zh_TW' },
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
    chrome.storage.local.set({
      pageTheme: 'light',
      tourDone: true,
      dirShowAll: true,
    }),
  )
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))
  const isList = () =>
    page.evaluate(
      () =>
        !document.querySelector('.mdr-scroll').hidden &&
        document.querySelector('.mdr-frame').hidden,
    )
  const fileShown = () =>
    page.evaluate(() => !document.querySelector('.mdr-frame').hidden)
  const open = async name => {
    await page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-list a')]
          .find(a => a.querySelector('.mdr-name').textContent === n)
          .click(),
      name,
    )
    await waitFor(fileShown)
    await sleep(name.endsWith('.pdf') ? 2500 : 800)
  }
  /** a real click in the middle of the frame: the keyboard focus goes in */
  const clickFrame = async () => {
    const b = await (await page.$('.mdr-frame')).boundingBox()
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await sleep(300)
  }

  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-list a')

  for (const name of ['pic.png', 'shape.svg', 'doc.pdf']) {
    // focus on the folder page (the file was opened from the list)
    await open(name)
    ok(await fileShown(), `${name} shown on the right`)
    await page.keyboard.press('Escape')
    ok(
      await waitFor(isList),
      `${name}, focus on the folder page: Esc goes back to the list`,
    )
  }

  // focus inside the picture (clicked on it)
  for (const name of ['pic.png', 'shape.svg']) {
    await open(name)
    await clickFrame()
    const focusIn = await page.evaluate(
      () => document.activeElement?.tagName === 'IFRAME',
    )
    ok(focusIn, `clicking ${name} puts the focus in its frame`)
    await page.keyboard.press('Escape')
    ok(
      await waitFor(isList),
      `${name}, focus in the picture: Esc goes back to the list`,
    )
  }
  // a Markdown file still closes through its own page
  await open('a.md')
  await page.keyboard.press('Escape')
  ok(await waitFor(isList), 'a.md: Esc goes back to the list as before')
  await page.screenshot({ path: `${outDir}/after-esc.png` })

  // a picture opened on its own tab is left alone: Esc does nothing there
  const solo = await browser.newPage()
  await solo.goto(`${base}/pic.png`)
  await sleep(500)
  await solo.keyboard.press('Escape')
  await sleep(500)
  ok(solo.url().endsWith('/pic.png'), 'a picture on its own tab stays put')
  await solo.close()

  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '))
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  await browser.close()
}
console.log(`passed ${pass}, failed ${fail}`)
process.exit(fail ? 1 : 0)
