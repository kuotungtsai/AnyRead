// Folder page as a project: the folder you open is the root. The left
// column is that folder's tree (never the folders around it); the main
// column lists the folder you are in, or shows a file. Going up stops at
// the root; a breadcrumb above it opens that folder as the new root.
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
  // what the two columns show
  const cols = () =>
    page.evaluate(() => {
      const mainList =
        !document.querySelector('.mdr-scroll').hidden &&
        !document.querySelector('.mdr-view').hidden
      const text = a => a.querySelector('span:last-child').textContent
      return {
        left: document.querySelector('.mdr-side-head b').textContent,
        up: !!document.querySelector('.mdr-tree > a'),
        leftItems: [
          ...document.querySelectorAll('.mdr-tree > ul > li > a'),
        ].map(text),
        tree: [...document.querySelectorAll('.mdr-tree ul a')].map(text),
        on: [...document.querySelectorAll('.mdr-tree a.on')].map(text),
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
        hash: location.hash,
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
          .find(a => a.querySelector('span:last-child').textContent === n)
          .querySelector('span:last-child')
          .click(),
      name,
    )
  // waits for the entry: the list fills in a moment after a folder opens
  const mainClick = async name => {
    await waitFor(
      async () => (await cols()).mainItems.includes(name),
      'main item ' + name,
    )
    await page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-list a')]
          .find(a => a.querySelector('.mdr-name').textContent === n)
          .click(),
      name,
    )
  }
  const crumb = name =>
    page.evaluate(
      n =>
        [...document.querySelectorAll('.mdr-crumbs a')]
          .find(a => a.textContent === n)
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

  // 1. open top/: it is the root. Left = top's own tree, no ↰, nothing
  // from the folder around it
  await page.goto(`${base}/top/`)
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ left: 'top', main: 'top' }), 'start')
  await waitFor(async () => (await cols()).leftItems.length === 4, 'tree')
  const c1 = await cols()
  ok(
    !c1.up &&
      c1.leftItems.join() === 'A,B,data.csv,t.md' &&
      c1.mainItems.join() === 'A,B,t.md,data.csv' &&
      c1.hash === '',
    'start: left is top itself (A, B, data.csv, t.md), no ↰: ' +
      JSON.stringify(c1),
  )
  await page.screenshot({ path: `${outDir}/cols-start.png` })

  // 2. down into A, then sub: the left stays top, the way there opens
  await mainClick('A')
  await waitFor(is({ left: 'top', main: 'A', on: ['A'], up: true }), 'A')
  await mainClick('sub')
  await waitFor(
    is({ left: 'top', main: 'sub', on: ['sub'], up: true }),
    'down to sub',
  )
  const c2 = await cols()
  ok(
    c2.tree.join() === 'A,sub,a1.md,a2.md,B,data.csv,t.md',
    'down to A/sub: left stays top, A opened to show sub (marked): ' +
      JSON.stringify(c2.tree),
  )
  await page.screenshot({ path: `${outDir}/cols-deep.png` })

  // 3. a file in the tree: shown in the main column; its link opens the
  // pane; Esc (pane, then file) back to sub's list
  await leftClick('a1.md')
  await waitFor(
    async () =>
      (await cols()).main === 'FILE' &&
      (await fileH1().catch(() => '')) === 'A one',
    'a1 shown',
  )
  const c3 = await cols()
  ok(
    c3.left === 'top' && c3.on.includes('a1.md'),
    'tree file click: the file on the right, left stays top: ' +
      JSON.stringify(c3.on),
  )
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
  await waitFor(is({ left: 'top', main: 'sub' }), 'esc back to sub')
  ok(true, 'Esc (pane, then file): back to the sub list')

  // 4. Back steps through: file, sub, A, top; the left stays top
  await page.goBack()
  await waitFor(async () => (await cols()).main === 'FILE', 'back to file')
  await page.goBack()
  await waitFor(is({ left: 'top', main: 'sub' }), 'back to sub')
  await page.goBack()
  await waitFor(is({ left: 'top', main: 'A' }), 'back to A')
  await page.goBack()
  await waitFor(is({ left: 'top', main: 'top', up: false }), 'back to top')
  ok(true, 'Back: file, sub, A, then top; the left stays top')

  // 5. a folder in the tree opens in the main column; ↰ goes up, and
  // stops at the root
  await leftClick('B')
  await waitFor(is({ left: 'top', main: 'B', on: ['B'], up: true }), 'B')
  await page.evaluate(() => document.querySelector('.mdr-tree > a').click())
  await waitFor(is({ left: 'top', main: 'top', up: false }), 'up to top')
  ok(true, 'tree folder B, then ↰: back to top, and no ↰ at the root')

  // 6. a breadcrumb inside the project: that folder, same root
  await mainClick('A')
  await waitFor(is({ main: 'A' }), 'A again')
  await crumb('top')
  await waitFor(is({ left: 'top', main: 'top', hash: '' }), 'crumb top')
  ok(true, 'breadcrumb "top" (the root): main = top, left stays top')

  // 7. a breadcrumb above the root: that folder becomes the root, and
  // the address keeps it, so a reload keeps it too
  await crumb('cols')
  await waitFor(
    is({ left: 'cols', main: 'cols', leftItems: ['top'], hash: '#root=../' }),
    'crumb cols',
  )
  ok(true, 'breadcrumb above the root ("cols"): cols is the new root')
  await page.reload()
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ left: 'cols', main: 'top', on: ['top'] }), 'reload')
  ok(true, 'reload: root cols kept, top listed and marked')

  // 8. an address with the root in it: that root, that folder
  await page.goto(`${base}/top/A/sub/#root=../../`)
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ left: 'top', main: 'sub', on: ['sub'] }), 'root in url')
  ok(true, 'top/A/sub/#root=../../: left = top, sub listed and marked')
  // a root that is not above the folder is ignored
  await page.goto(`${base}/top/A/#root=sub/`)
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ left: 'A', main: 'A', up: false }), 'bad root')
  ok(true, 'a root that is not above the folder is ignored')

  // 8b. many folders: the tree scrolls to the deep folder it marks
  const many = new URL('../manytree/', base + '/').href
  await page.goto(`${many}f30/inner/deep/#root=../../../`)
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ left: 'manytree', main: 'deep', on: ['deep'] }), 'many')
  await sleep(400)
  const seen = await page.evaluate(() => {
    const r = document.querySelector('.mdr-tree a.on').getBoundingClientRect()
    const box = document.querySelector('.mdr-tree').getBoundingClientRect()
    return r.top >= box.top && r.bottom <= box.bottom
  })
  ok(seen, 'many folders: the marked deep folder is scrolled into view')

  // 8c. a file opened from a folder the tree has not opened: the tree
  // opens that folder and marks the file
  await page.goto(`${base}/top/A/#root=../`)
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ left: 'top', main: 'A' }), 'A in top')
  await mainClick('a1.md')
  await waitFor(
    async () => (await cols()).on.includes('a1.md'),
    'a1 marked in the tree',
  ).catch(() => {})
  const c8 = await cols()
  ok(
    c8.on.includes('a1.md') && c8.tree.includes('a1.md'),
    'a file shown: the tree opens its folder and marks it: ' +
      JSON.stringify(c8.on),
  )

  // 9. a CSV in the main list: table page, its Close back to the list
  await page.goto(`${base}/top/`)
  await page.waitForSelector('.mdr-app')
  await waitFor(is({ main: 'top' }), 'top again')
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
  await waitFor(is({ left: 'top', main: 'top' }), 'csv closed')
  ok(true, 'CSV on the right; Close back to top')

  // 10. the top of a drive: the drive is the root, listed on both sides
  if (process.platform !== 'win32') console.log('SKIP drive root (not Windows)')
  else {
    // Windows only; checks the page's structure and prints no file names
    const drive = (process.env.SystemDrive || 'C:').replace(/[\\/]$/, '')
    await page.goto(`file:///${drive}/`)
    await page.waitForSelector('.mdr-app')
    await waitFor(async () => {
      const c = await cols()
      return (
        c.left === drive &&
        c.main === drive &&
        !c.up &&
        c.leftItems.length > 0 &&
        c.mainItems.length > 0
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
          hash: location.hash,
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
