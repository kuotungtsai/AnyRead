// "Browse all folders" (Settings) on: the folder page as AnyRead had it
// before projects. The main column lists a folder (or shows a file), the
// left column lists the folder above it, and going up has no end.
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
    chrome.storage.local.set({
      pageTheme: 'light',
      tourDone: true,
      dirExplore: true,
    }),
  )
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))
  const fr = () => page.frames().find(f => f.name() === 'anyread-folder')
  // what the two columns show
  const cols = () =>
    page.evaluate(() => {
      const mainList =
        !document.querySelector('.mdr-scroll').hidden &&
        !document.querySelector('.mdr-view').hidden
      return {
        left: document.querySelector('.mdr-side-head b').textContent,
        up: !!document.querySelector('.mdr-tree > a'),
        leftItems: [
          ...document.querySelectorAll('.mdr-tree > ul > li > a'),
        ].map(a => a.textContent.slice(1)),
        on: [...document.querySelectorAll('.mdr-tree a.on')].map(a =>
          a.textContent.slice(1),
        ),
        main: mainList
          ? document.querySelector('.mdr-view h1').textContent
          : document.querySelector('.mdr-frame').hidden
          ? '?'
          : 'FILE',
        mainItems: mainList
          ? [...document.querySelectorAll('.mdr-list a .mdr-name')].map(
              s => s.textContent,
            )
          : [],
      }
    })
  const is = want => async () => {
    const c = await cols()
    return Object.entries(want).every(
      ([k, v]) => JSON.stringify(c[k]) === JSON.stringify(v),
    )
  }
  const leftClick = name =>
    page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-tree a')]
          .find(a => a.textContent.slice(1) === n)
          .querySelector('span:last-child')
          .click(),
      name,
    )
  const arrowClick = name =>
    page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-tree a')]
          .find(a => a.textContent.slice(1) === n)
          .querySelector('.mdr-tree-icon')
          .click(),
      name,
    )
  const mainClick = name =>
    page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-list a')]
          .find(a => a.querySelector('.mdr-name').textContent === n)
          .click(),
      name,
    )
  const fileH1 = () =>
    fr().evaluate(() =>
      document
        .querySelector('.md-reader__markdown-content h1')
        ?.textContent.replace(/#/g, '')
        .trim(),
    )

  // 1. open top/A/: main = A, left = top with A marked, ↰ there
  await page.goto(`${base}/top/A/`)
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ left: 'top', main: 'A', on: ['A'] }), 'start')
  const c1 = await cols()
  ok(
    c1.up &&
      c1.leftItems.join() === 'A,B,data.csv,t.md' &&
      c1.mainItems.join() === 'sub,a1.md,a2.md',
    'start: main lists A, left lists top (the folder above), A marked: ' +
      JSON.stringify(c1),
  )
  await page.screenshot({ path: `${outDir}/cols-start.png` })

  // 2. a folder in the main column: one level down, left follows
  await mainClick('sub')
  await waitFor(is({ left: 'A', main: 'sub', on: ['sub'] }), 'down to sub')
  ok(true, 'main folder click: main = sub, left = A, sub marked')

  // 3. a file on the left: shown in the main column; Esc back to sub's list
  await leftClick('a1.md')
  await waitFor(
    async () =>
      (await cols()).main === 'FILE' &&
      (await fileH1().catch(() => '')) === 'A one',
    'a1 shown',
  )
  const c3 = await cols()
  ok(
    c3.left === 'A' && c3.on.includes('a1.md'),
    'left file click: file in the main column, left stays A: ' +
      JSON.stringify(c3.on),
  )
  // link inside the file still opens the split pane
  const h = await fr().$('.md-reader__markdown-content a[href$="a2.md"]')
  const b = await h.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await waitFor(
    () =>
      fr().evaluate(
        () =>
          !!document
            .querySelector('.md-reader__preview')
            ?.textContent.includes('Second'),
      ),
    'pane',
  )
  ok(true, 'a link in the file opens the split pane')
  await page.keyboard.press('Escape') // pane
  await sleep(400)
  await page.keyboard.press('Escape') // file
  await waitFor(is({ left: 'A', main: 'sub' }), 'esc back to sub')
  ok(true, 'Esc (pane, then file): back to the sub list')

  // 4. Back steps through: file, sub list, then A
  await page.goBack()
  await waitFor(async () => (await cols()).main === 'FILE', 'back to file')
  await page.goBack()
  await waitFor(is({ left: 'A', main: 'sub' }), 'back to sub')
  await page.goBack()
  await waitFor(is({ left: 'top', main: 'A' }), 'back to A')
  ok(true, 'Back: file, then the sub list, then A with top on the left')

  // 5. a folder on the left: main shows it, left stays
  await leftClick('B')
  await waitFor(is({ left: 'top', main: 'B', on: ['B'] }), 'B')
  ok(true, 'left folder click: main = B, left stays top')

  // 6. ▸ expands in the tree only; a folder inside it opens in the main column, left stays
  await arrowClick('A')
  await waitFor(
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.mdr-tree a')].some(
          a => a.textContent.slice(1) === 'sub',
        ),
      ),
    'expanded',
  )
  ok((await cols()).main === 'B', '▸ expands A in the tree; main still B')
  await leftClick('sub')
  await waitFor(is({ left: 'top', main: 'sub' }), 'deep sub')
  ok(true, 'folder inside the expanded tree: main = sub, left stays top')

  // 7. ↰ on the left: both columns move up
  await page.evaluate(() => document.querySelector('.mdr-tree > a').click())
  await waitFor(is({ left: 'cols', main: 'top', on: ['top'] }), 'up')
  ok(true, '↰: main = top, left = cols')

  // 8. breadcrumb: that folder, its parent on the left
  await mainClick('A')
  await waitFor(is({ left: 'top', main: 'A' }), 'A again')
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-crumbs a')]
      .find(a => a.textContent === 'top')
      .click(),
  )
  await waitFor(is({ left: 'cols', main: 'top' }), 'crumb top')
  ok(
    !(await page.evaluate(() => location.hash)),
    'breadcrumb "top": main = top, left = cols; no #root in the address',
  )

  // 9. a CSV in the main list: table page, its Close back to the list
  await mainClick('data.csv')
  await waitFor(
    () =>
      fr().evaluate(
        () => document.querySelectorAll('.anyread-table tbody tr').length === 1,
      ),
    'csv',
  )
  // the table page is an extension page in a frame, where puppeteer cannot
  // always place a mouse click: click the button from inside it
  await fr()
    .evaluate(() => document.querySelector('#close').click())
    .catch(() => {})
  await waitFor(is({ left: 'cols', main: 'top' }), 'csv closed')
  ok(true, 'CSV in the main column; Close back to top')

  // 10. the top of a drive: the drive on both sides (nothing above it)
  if (process.platform !== 'win32') console.log('SKIP drive root (not Windows)')
  else {
    // Windows only; checks the page's structure and prints no file names
    const drive = (process.env.SystemDrive || 'C:').replace(/[\\/]$/, '')
    await page.goto(`file:///${drive}/`)
    await page.waitForSelector('.mdr-app')
    await sleep(1500)
    {
      const c = await cols()
      console.log(
        'root view:',
        JSON.stringify({
          left: c.left,
          up: c.up,
          main: c.main,
          nLeft: c.leftItems.length,
          nMain: c.mainItems.length,
        }),
      )
    }
    await waitFor(async () => {
      const c = await cols()
      return (
        c.main === drive && c.left === drive && !c.up && c.leftItems.length > 0
      )
    }, 'root')
    ok(true, `drive root: ${drive} on both sides, no ↰`)
  }
} catch (e) {
  fail++
  console.log('FAIL', e.message)
  try {
    console.log(
      'cols',
      JSON.stringify(
        await (await browser.pages()).at(-1).evaluate(() => ({
          left: document.querySelector('.mdr-side-head b')?.textContent,
          h1: document.querySelector('.mdr-view h1')?.textContent,
        })),
      ),
    )
  } catch {}
} finally {
  console.log('page errors:', errors.length, errors.slice(0, 3).join(' / '))
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
