// Esc closes the split pane: on a page of its own, and inside the folder page
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
const [exe, ext, demo, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = 'file:///' + demo.replace(/\\/g, '/')
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
  defaultViewport: { width: 1400, height: 800 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
    '--lang=zh-TW',
  ],
  env: { ...process.env, LANGUAGE: 'zh_TW' },
})
const paneOpen = f =>
  f.evaluate(() => !!document.querySelector('.md-reader__preview h1'))
// a real mouse click, so the keyboard focus moves into that document
const clickNotes = async f =>
  (await f.$('.md-reader__markdown-content a[href$="notes.txt"]')).click()
const waitFor = async (fn, label) => {
  for (let i = 0; i < 40; i++) {
    if (await fn().catch(() => false)) return true
    await sleep(200)
  }
  throw new Error(label)
}
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

  // 1. README.md on its own page
  await page.goto(`${base}/README.md`)
  await page.waitForSelector('.md-reader__markdown-content a')
  await sleep(800)
  await clickNotes(page.mainFrame())
  await sleep(1500)
  console.log(
    'after click:',
    page.url(),
    await page.evaluate(() =>
      document.querySelector('.md-reader__preview')?.outerHTML.slice(0, 300),
    ),
  )
  await waitFor(() => paneOpen(page.mainFrame()), 'pane')
  console.log(
    'close label:',
    await page.$eval(
      '.md-reader__preview-bar button[data-act=close]',
      b => b.textContent,
    ),
  )
  await page.keyboard.press('Escape')
  await sleep(500)
  ok(!(await paneOpen(page.mainFrame())), 'own page: Esc closes the pane')

  // 2. inside the folder page, focus in the file
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-tree a')
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')]
      .find(a => a.querySelector('.mdr-name').textContent === 'README.md')
      .click(),
  ) // the list comes first now
  const frame = () => page.frames().find(f => f.url().endsWith('README.md'))
  await waitFor(
    async () => !!(await frame()?.$('.md-reader__markdown-content a')),
    'frame',
  )
  await clickNotes(frame())
  await waitFor(() => paneOpen(frame()), 'pane in frame')
  await page.keyboard.press('Escape')
  await sleep(500)
  ok(
    !(await paneOpen(frame())),
    'folder page, focus in the file: Esc closes the pane',
  )

  // 3. inside the folder page, focus moved to the tree (a folder opened)
  await clickNotes(frame())
  await waitFor(() => paneOpen(frame()), 'pane in frame again')
  await page.evaluate(() => document.querySelector('.mdr-tree a').focus())
  await page.keyboard.press('Escape')
  await sleep(500)
  ok(
    !(await paneOpen(frame())),
    'folder page, focus in the tree: Esc closes the pane',
  )
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
