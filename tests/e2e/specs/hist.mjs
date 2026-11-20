// Folder page history: Back / Forward between the file list and files,
// the table page's Close (Esc) inside the folder page.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
const [exe, ext, dir, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = 'file:///' + dir.replace(/\\/g, '/')
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
  const state = () =>
    page.evaluate(() => ({
      url: location.href,
      list: !document.querySelector('.mdr-scroll').hidden,
      frame: !document.querySelector('.mdr-frame').hidden,
      on: !document.querySelector('.mdr-frame').hidden
        ? decodeURIComponent(history.state?.anyreadView?.shown || '')
        : '檔案清單',
    }))
  const isList = async () => {
    const s = await state()
    return s.list && !s.frame && s.on.includes('檔案清單')
  }
  const shows = name => async () => {
    const s = await state()
    return s.frame && !s.list && s.on.endsWith(name)
  }
  const tree = name =>
    page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-list a')]
          .find(a => a.querySelector('.mdr-name').textContent === n)
          .click(),
      name,
    )

  // start somewhere else, then the folder (no README: the list first)
  await page.goto(`${base}/start.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await page.goto(`${base}/nolist/`)
  await page.waitForSelector('.mdr-list a')
  await waitFor(isList, 'list first')
  ok(true, 'folder without README: list first')

  // 1. list -> xlsx -> Back = list, still on the folder page
  await page.click('.mdr-list a[href$="book.xlsx"]')
  await waitFor(
    () => Promise.resolve(fr()?.url().includes('table.html')),
    'table in frame',
  )
  await waitFor(
    () =>
      fr().evaluate(
        () => document.querySelectorAll('.anyread-table tbody tr').length === 2,
      ),
    'table rows',
  )
  await waitFor(shows('book.xlsx'), 'tree marks xlsx')
  const closeBtn = await fr().evaluate(() => {
    const b = document.getElementById('close')
    return b && !b.hidden ? b.textContent : ''
  })
  ok(
    closeBtn === '關閉 (Esc)',
    'table page in the folder has Close: ' + closeBtn,
  )
  await page.goBack()
  await waitFor(isList, 'back to list')
  ok(
    (await state()).url.endsWith('/nolist/'),
    'Back from the xlsx: the file list, same folder page',
  )
  await page.goForward()
  await waitFor(shows('book.xlsx'), 'forward to xlsx')
  await waitFor(
    () =>
      fr().evaluate(
        () => document.querySelectorAll('.anyread-table tbody tr').length === 2,
      ),
    'table again',
  )
  ok(true, 'Forward: the xlsx again')

  // 2. Close button -> list; Esc in the table page -> list; Esc with the tree focused -> list
  await fr().click('#close')
  await waitFor(isList, 'close')
  ok(true, 'Close: back to the list')
  await tree('data.csv')
  await waitFor(
    () =>
      fr().evaluate(
        () => document.querySelectorAll('.anyread-table tbody tr').length === 1,
      ),
    'csv',
  )
  await fr()
    .focus('body')
    .catch(() => {})
  await fr().evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  )
  await waitFor(isList, 'esc in table')
  ok(true, 'Esc in the table page: list')
  await tree('data.csv')
  await waitFor(shows('data.csv'), 'csv again')
  await waitFor(
    () =>
      fr().evaluate(
        () =>
          document.querySelectorAll('.anyread-table tbody tr').length === 1 &&
          !document.getElementById('close').hidden,
      ),
    'csv loaded',
  )
  await page.evaluate(() => document.querySelector('.mdr-tree a').focus())
  await page.keyboard.press('Escape')
  await waitFor(isList, 'esc in tree')
  ok(true, 'Esc with the tree focused: list')

  // 3. tree a.md -> tree book.xlsx; Back = a.md; Back = list
  await tree('a.md')
  await waitFor(
    async () => !!(await fr()?.$('.md-reader__markdown-content h1')),
    'a.md',
  )
  await tree('book.xlsx')
  await waitFor(shows('book.xlsx'), 'xlsx')
  await page.goBack()
  await waitFor(shows('a.md'), 'back to a.md')
  await sleep(1500)
  console.log(
    'h1 is',
    JSON.stringify(
      await fr().evaluate(() => [
        location.href.split('/').pop(),
        document.querySelector('.md-reader__markdown-content h1')?.textContent,
      ]),
    ),
  )
  await waitFor(
    async () =>
      (await fr().evaluate(() =>
        document
          .querySelector('.md-reader__markdown-content h1')
          ?.textContent.replace(/#/g, '')
          .trim(),
      )) === 'A',
    'a.md content',
  )
  ok(true, 'Back from the xlsx opened after a.md: a.md')

  // 4. link followed inside the frame (pane "Open here" to b.md): Back = a.md
  await fr().click('.md-reader__markdown-content a[href$="b.md"]')
  await waitFor(
    () =>
      fr().evaluate(
        () =>
          !!document
            .querySelector('.md-reader__preview')
            ?.textContent.includes('Bee'),
      ),
    'pane b',
  )
  await fr().click('.md-reader__preview-bar button[data-act="open-here"]')
  await waitFor(shows('b.md'), 'b.md in frame')
  await page.goBack()
  await waitFor(shows('a.md'), 'back to a after open here')
  ok(true, 'Open here inside the frame, then Back: a.md, tree marks it')
  await page.goForward()
  await waitFor(shows('b.md'), 'forward b')
  await tree('data.csv')
  await waitFor(shows('data.csv'), 'csv after b')
  await page.goBack()
  await waitFor(shows('b.md'), 'back to b')
  await waitFor(
    async () =>
      (await fr().evaluate(() =>
        document
          .querySelector('.md-reader__markdown-content h1')
          ?.textContent.replace(/#/g, '')
          .trim(),
      )) === 'B',
    'b content',
  )
  ok(true, 'tree file after Open here, then Back: b.md (the file shown before)')

  // walk all the way back: every step stays on the folder page (list or a
  // file on the right) until the page before it
  let steps = 0,
    okSteps = true
  while (steps < 30) {
    await page.goBack()
    await sleep(700)
    steps++
    if (page.url().endsWith('/start.md')) break
    const s = await state().catch(() => null)
    if (!s || !s.url.includes('/nolist/') || s.list === s.frame) {
      okSteps = false
      console.log('odd step', JSON.stringify(s))
    }
  }
  ok(okSteps, 'every Back step on the folder page shows the list or a file')
  ok(
    page.url().endsWith('/start.md'),
    `after ${steps} Back steps: the page before the folder`,
  )

  // 5. folder with a README: still the list first; README, a tree file, then Back = README
  await page.goto(`${base}/withreadme/`)
  await page.waitForSelector('.mdr-list a')
  await waitFor(isList, 'list first with readme')
  ok(true, 'folder with a README opens on the file list')
  await tree('README.md')
  await waitFor(shows('README.md'), 'readme opened')
  await tree('book.xlsx')
  await waitFor(shows('book.xlsx'), 'xlsx 2')
  await page.goBack()
  await waitFor(shows('README.md'), 'back to readme')
  ok(true, 'folder with README: Back from the xlsx shows README again')

  // 6. the table page on its own (new tab) has no Close
  await page.goto(
    `chrome-extension://${id}/table.html?src=${encodeURIComponent(
      base + '/nolist/book.xlsx',
    )}`,
  )
  await waitFor(
    () =>
      page.evaluate(
        () => document.querySelectorAll('.anyread-table tbody tr').length === 2,
      ),
    'table alone',
  )
  ok(
    await page.evaluate(() => document.getElementById('close').hidden),
    'table page on its own: no Close button',
  )
} catch (e) {
  fail++
  console.log('FAIL', e.message)
  try {
    const pg = (await browser.pages()).at(-1)
    console.log(
      'state',
      JSON.stringify(
        await pg.evaluate(() => ({
          st: history.state,
          on: document.querySelector('.mdr-tree a.on')?.textContent,
          list: !document.querySelector('.mdr-scroll')?.hidden,
        })),
      ),
      pg
        .frames()
        .map(f => f.url().split('/').pop())
        .join(' , '),
    )
  } catch (x) {
    console.log('no state', x.message)
  }
} finally {
  console.log('page errors:', errors.length, errors.slice(0, 3).join(' / '))
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
