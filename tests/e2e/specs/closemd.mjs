// A Markdown file on the right of the folder page: Close (Esc) button and Esc.
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
const waitFor = async (fn, label, n = 50) => {
  for (let i = 0; i < n; i++) {
    if (await fn().catch(() => false)) return true
    await sleep(200)
  }
  throw new Error('timeout: ' + label)
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
    chrome.storage.local.set({ pageTheme: 'light', tourDone: true }),
  )
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))
  const fr = () => page.frames().find(f => f.name() === 'anyread-folder')
  const isList = () =>
    page.evaluate(
      () =>
        !document.querySelector('.mdr-scroll').hidden &&
        document.querySelector('.mdr-frame').hidden,
    )
  const tree = name =>
    page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-list a')]
          .find(a => a.querySelector('.mdr-name').textContent === n)
          .click(),
      name,
    )
  const openA = async () => {
    await tree('a.md')
    await waitFor(
      async () => !!(await fr()?.$('.md-reader__btn--close-file')),
      'a.md with close',
    )
    await sleep(300)
  }
  const realClick = async sel => {
    const h = await fr().$(sel)
    const b = await h.boundingBox()
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  }

  await page.goto(`${base}/nolist/`)
  await page.waitForSelector('.mdr-list a')

  // 1. the button: title, place, click
  await openA()
  const btn = await fr().evaluate(() => {
    const r = s => document.querySelector(s)?.getBoundingClientRect()
    const c = r('.md-reader__btn--close-file'),
      code = r('.md-reader__btn--code-toggle'),
      edit = r('.md-reader__btn--edit-toggle'),
      exp = r('.md-reader__btn--export')
    return {
      title: document.querySelector('.md-reader__btn--close-file').title,
      order: c.x > code.x && code.x > edit.x && edit.x > exp.x,
      gap: Math.round(c.x - code.x),
      right: Math.round(innerWidth - c.right),
    }
  })
  ok(
    btn.title === '關閉 (Esc)' && btn.order && btn.gap === 40,
    'Close (Esc) button at the right of the icons: ' + JSON.stringify(btn),
  )
  await page.screenshot({ path: `${outDir}/close-md.png` })
  await realClick('.md-reader__btn--close-file')
  await waitFor(isList, 'click close')
  ok(true, 'click Close: back to the file list')

  // 2. Esc in the file (focus inside it)
  await openA()
  await realClick('.md-reader__markdown-content h1')
  await page.keyboard.press('Escape')
  await waitFor(isList, 'esc in file')
  ok(true, 'Esc in the file: back to the list')

  // 3. split pane open: Esc closes only the pane, a second Esc the file
  await openA()
  await realClick('.md-reader__markdown-content a[href$="b.md"]')
  await waitFor(
    () =>
      fr().evaluate(
        () =>
          !!document
            .querySelector('.md-reader__preview')
            ?.textContent.includes('Bee'),
      ),
    'pane',
  )
  await page.keyboard.press('Escape')
  await sleep(600)
  const afterOne = await fr().evaluate(() => ({
    pane:
      !!document.querySelector('.md-reader__preview') &&
      getComputedStyle(document.querySelector('.md-reader__preview'))
        .display !== 'none' &&
      document.querySelector('.md-reader__preview').textContent.includes('Bee'),
  }))
  ok(
    !(await isList()) && !afterOne.pane,
    'pane open: first Esc closes only the pane ' + JSON.stringify(afterOne),
  )
  await page.keyboard.press('Escape')
  await waitFor(isList, 'second esc')
  ok(true, 'second Esc: back to the list')

  // 4. tree focused: pane first, then the file
  await openA()
  await realClick('.md-reader__markdown-content a[href$="b.md"]')
  await waitFor(
    () =>
      fr().evaluate(
        () =>
          !!document
            .querySelector('.md-reader__preview')
            ?.textContent.includes('Bee'),
      ),
    'pane 2',
  )
  await page.evaluate(() => document.querySelector('.mdr-tree a').focus())
  await page.keyboard.press('Escape')
  await sleep(600)
  ok(
    !(await isList()),
    'tree focused, pane open: Esc closes the pane, the file stays',
  )
  await page.keyboard.press('Escape')
  await waitFor(isList, 'tree esc 2')
  ok(true, 'tree focused, again Esc: back to the list')

  // 5. edit mode: Esc does not close the file
  await openA()
  await fr().evaluate(() =>
    document.querySelector('.md-reader__btn--edit-toggle').click(),
  )
  await waitFor(
    () =>
      fr().evaluate(
        () =>
          !!document.querySelector('.md-reader__editor-textarea') &&
          getComputedStyle(
            document.querySelector('.md-reader__editor-textarea'),
          ).display !== 'none',
      ),
    'editor',
  )
  await realClick('.md-reader__editor-textarea')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await sleep(600)
  ok(!(await isList()), 'edit mode: Esc keeps the file open')
  await fr().evaluate(() =>
    document.querySelector('.md-reader__btn--edit-toggle').click(),
  )
  await sleep(400)
  await realClick('.md-reader__btn--close-file')
  await waitFor(isList, 'close after edit')
  ok(true, 'after leaving edit mode, Close works')

  // 6. a Markdown page on its own tab: no Close button, Esc does nothing
  await page.goto(`${base}/nolist/a.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await sleep(500)
  ok(
    await page.evaluate(
      () => !document.querySelector('.md-reader__btn--close-file'),
    ),
    'own tab: no Close button',
  )
  await page.keyboard.press('Escape')
  await sleep(500)
  ok(page.url().endsWith('/a.md'), 'own tab: Esc stays on the page')
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log('page errors:', errors.length, errors.slice(0, 3).join(' / '))
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
