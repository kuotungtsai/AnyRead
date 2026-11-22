// Folder page: tree on the left, the chosen file on the right; .txt as Markdown.
import puppeteer from '../browser.mjs'
import { pathToFileURL } from 'node:url'
import fs from 'fs'
import path from 'path'
const [exe, ext, demo, demo2, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = pathToFileURL(demo).href
// the folder holding the fixtures: what the left column shows above demo/
const parentName = path.basename(path.dirname(path.resolve(demo)))
const base2 = pathToFileURL(demo2).href
let pass = 0,
  fail = 0
const ok = (c, m) => {
  c ? pass++ : fail++
  console.log(c ? 'PASS' : 'FAIL', m)
}
fs.mkdirSync(outDir, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(outDir, 'prof-')),
  ignoreDefaultArgs: ['--disable-extensions'],
  defaultViewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
    '--lang=zh-TW',
  ],
  env: { ...process.env, LANGUAGE: 'zh_TW' },
})
const errors = []
const frameOf = page =>
  page
    .frames()
    .find(
      f =>
        f !== page.mainFrame() &&
        f.parentFrame() === page.mainFrame() &&
        !f.url().includes('mdr-dir='),
    )
const waitFrame = async (page, test, label) => {
  for (let i = 0; i < 60; i++) {
    const f = frameOf(page)
    if (f) {
      const r = await f.evaluate(test).catch(() => null)
      if (r) return f
    }
    await sleep(200)
  }
  throw new Error('frame never showed ' + label)
}
// files of the folder are in the main column's list now (the left column lists the folder above)
const clickTree = (page, name) =>
  page.evaluate(
    n =>
      [...document.querySelectorAll('.mdr-list a')]
        .find(a => a.querySelector('.mdr-name').textContent === n)
        .click(),
    name,
  )
try {
  const sw = await browser.waitForTarget(t => t.type() === 'service_worker', {
    timeout: 10000,
  })
  const id = new URL(sw.url()).host
  const opt = await browser.newPage()
  await opt.goto(`chrome-extension://${id}/options.html`)
  await opt.evaluate(() => chrome.storage.local.set({ pageTheme: 'light' })) // tourDone left false on purpose
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))

  // 1. folder with a README: its list in the main column, its own tree on
  // the left (the folder opened is the project)
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-list a .mdr-name', { timeout: 8000 })
  await page.waitForSelector('.mdr-tree ul a', { timeout: 8000 })
  const names = await page.$$eval('.mdr-list a .mdr-name', l =>
    l.map(a => a.textContent),
  )
  ok(
    ['sub', 'README.md', 'notes.txt', 'data.csv', 'flow.mmd'].every(n =>
      names.includes(n),
    ),
    'main list: ' + names.join(' | '),
  )
  const first = await page.evaluate(() => ({
    list: !document.querySelector('.mdr-scroll').hidden,
    frame: !document.querySelector('.mdr-frame').hidden,
    left: document.querySelector('.mdr-side-head b').textContent,
    tree: [...document.querySelectorAll('.mdr-tree > ul > li > a')].map(a =>
      a.textContent.slice(1),
    ),
  }))
  ok(
    first.list &&
      !first.frame &&
      first.left === 'demo' &&
      first.tree.includes('sub') &&
      first.tree.includes('README.md'),
    'folder with a README opens on its list; left = the own tree of demo: ' +
      JSON.stringify(first),
  )
  await clickTree(page, 'README.md')
  const f1 = await waitFrame(
    page,
    () =>
      document
        .querySelector('.md-reader__markdown-content h1')
        ?.textContent.includes('Demo project'),
    'README',
  )
  ok(!!f1, 'README shown on the right')
  const inner = await f1.evaluate(() => ({
    collapsed:
      document.body.classList.contains('md-reader__side-collapsed') ||
      getComputedStyle(
        document.querySelector('.md-reader__side') || document.body,
      ).display === 'none' ||
      document.body.className,
    tour: !!document.querySelector('[class*=tour]'),
  }))
  ok(!inner.tour, 'no tour inside the folder page: ' + JSON.stringify(inner))
  const bar = await page.evaluate(() => ({
    bar: !!document.querySelector('.mdr-main-bar, .mdr-main button'),
    on: document.querySelector('.mdr-tree a.on')?.textContent,
  }))
  ok(!bar.bar, 'no button bar: ' + JSON.stringify(bar))
  await sleep(600)
  await page.screenshot({ path: path.join(outDir, 'folder-readme.png') })

  // 2. .txt in the tree: rendered as Markdown with line breaks
  await clickTree(page, 'notes.txt')
  const f2 = await waitFrame(
    page,
    () =>
      document
        .querySelector('.md-reader__markdown-content h1')
        ?.textContent.includes('Meeting notes'),
    'notes.txt',
  )
  const txt = await f2.evaluate(() => ({
    br: document.querySelectorAll('.md-reader__markdown-content br').length,
    li: document.querySelectorAll('.md-reader__markdown-content li').length,
  }))
  ok(
    txt.br >= 1 && txt.li === 2,
    '.txt rendered as Markdown, line breaks kept: ' + JSON.stringify(txt),
  )
  ok(page.url().endsWith('/demo/'), 'still on the folder page')

  // 3. CSV in the tree: the table page in the frame
  await clickTree(page, 'data.csv')
  const f3 = await waitFrame(
    page,
    () => document.querySelectorAll('.anyread-table tbody tr').length === 1,
    'csv',
  )
  ok(!!f3, 'CSV shown as a table on the right')
  await sleep(400)
  await page.screenshot({ path: path.join(outDir, 'folder-csv.png') })

  // 4. Mermaid
  await clickTree(page, 'flow.mmd')
  await waitFrame(
    page,
    () => !!document.querySelector('.md-reader__markdown-content svg'),
    'mmd',
  )
  ok(true, '.mmd drawn on the right')

  // 5. sub folder in the main list: one level down, the left column follows
  await page.evaluate(
    () => [...document.querySelectorAll('.md-reader__btn--close-file')].length,
  ) // (in frame)
  await frameOf(page)
    .click('.md-reader__btn--close-file')
    .catch(() => {})
  await page
    .waitForFunction(() => !document.querySelector('.mdr-scroll').hidden, {
      timeout: 5000,
    })
    .catch(() => {})
  await clickTree(page, 'sub')
  await page.waitForFunction(
    () =>
      document.querySelector('.mdr-view h1')?.textContent === 'sub' &&
      [...document.querySelectorAll('.mdr-list a .mdr-name')].some(
        a => a.textContent === 'guide.md',
      ),
    { timeout: 8000 },
  )
  await clickTree(page, 'guide.md')
  await waitFrame(
    page,
    () =>
      document
        .querySelector('.md-reader__markdown-content h1')
        ?.textContent.includes('Guide'),
    'guide',
  )
  const on = await page.evaluate(() => ({
    left: document.querySelector('.mdr-side-head b').textContent,
    on: document.querySelector('.mdr-tree a.on')?.textContent,
  }))
  ok(
    on.left === 'demo' && on.on?.endsWith('sub'),
    'sub folder: left = demo with sub marked, guide.md shown: ' +
      JSON.stringify(on),
  )
  await page.evaluate(() => document.querySelector('.mdr-tree > a').click()) // ↰ back up: main = demo

  // 6. a link inside the shown file opens the split pane there; "Open here"
  //    puts it in the frame and the bar follows
  await clickTree(page, 'README.md')
  const f6 = await waitFrame(
    page,
    () =>
      document
        .querySelector('.md-reader__markdown-content h1')
        ?.textContent.includes('Demo project'),
    'README again',
  )
  await f6.evaluate(() =>
    [...document.querySelectorAll('.md-reader__markdown-content a')]
      .find(a => a.textContent === 'the notes')
      .click(),
  )
  const f6b = await waitFrame(
    page,
    () =>
      document
        .querySelector('.md-reader__preview h1')
        ?.textContent.includes('Meeting notes'),
    'split pane in frame',
  )
  ok(
    await f6b.evaluate(() => location.href.endsWith('README.md')),
    'a link in the frame opens the split pane',
  )
  await f6b.click('.md-reader__preview-bar button[data-act="open-here"]')
  await waitFrame(
    page,
    () =>
      location.href.endsWith('notes.txt') &&
      document
        .querySelector('.md-reader__markdown-content h1')
        ?.textContent.includes('Meeting notes'),
    'open here in frame',
  )
  await sleep(500)
  const after = await page.evaluate(() => ({
    on: document.querySelector('.mdr-tree a.on')?.textContent,
    url: location.href,
  }))
  ok(
    after.url.endsWith('/demo/'),
    'open here in the pane: still the folder page: ' + JSON.stringify(after),
  )
  const csvLink = await waitFrame(page, () => true, 'any')
  // 7. file list, and a file clicked there opens on the right
  await frameOf(page).click('.md-reader__btn--close-file')
  await page.waitForFunction(
    () => !document.querySelector('.mdr-scroll').hidden,
    { timeout: 5000 },
  )
  ok(true, 'Close: the file list again')
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')]
      .find(a => a.textContent.includes('flow.mmd'))
      .click(),
  )
  await waitFrame(
    page,
    () => !!document.querySelector('.md-reader__markdown-content svg'),
    'list click',
  )
  ok(page.url().endsWith('/demo/'), 'a file in the list opens on the right')

  // 8. .txt opened directly is a Markdown page
  await page.goto(`${base}/notes.txt`)
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 8000,
  })
  const direct = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('.md-reader__markdown-content h1').textContent,
    side: !!document.querySelector('.md-reader__side'),
  }))
  ok(
    direct.h1.includes('Meeting notes') &&
      direct.title.includes('Meeting notes') &&
      direct.side,
    '.txt opened directly is a reader page: ' + JSON.stringify(direct),
  )

  // 9. a .txt without a heading: the title is the file name; lines kept
  await page.goto(`${base2}/plain.txt`)
  await page.waitForSelector('.md-reader__markdown-content p', {
    timeout: 8000,
  })
  const plain = await page.evaluate(() => ({
    title: document.title,
    br: document.querySelectorAll('.md-reader__markdown-content br').length,
  }))
  ok(
    plain.title === 'plain.txt' && plain.br === 1,
    'plain .txt: ' + JSON.stringify(plain),
  )

  // 10. a folder without a README shows the file list
  await page.goto(`${base2}/`)
  await page.waitForSelector('.mdr-list a', { timeout: 8000 })
  await sleep(300)
  const noReadme = await page.evaluate(() => ({
    list: !document.querySelector('.mdr-scroll').hidden,
    frame: !document.querySelector('.mdr-frame').hidden,
  }))
  ok(noReadme.list && !noReadme.frame, 'no README: the list is shown')
  // 11. "Parent folder" only below the project's top: none at demo itself;
  // in sub it goes back to demo, on the same page
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-tree ul a')
  const items = await page.$$eval('.mdr-tree > a', l =>
    l.map(a => a.textContent),
  )
  ok(
    items.length === 0,
    'no "Parent folder" at the project top: ' + items.join(' | '),
  )
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')]
      .find(a => a.querySelector('.mdr-name').textContent === 'sub')
      .click(),
  )
  await page.waitForFunction(
    () =>
      document.querySelector('.mdr-view h1')?.textContent === 'sub' &&
      document
        .querySelector('.mdr-tree > a')
        ?.textContent.endsWith('上一層資料夾'),
    { timeout: 8000 },
  )
  await page.evaluate(() => document.querySelector('.mdr-tree > a').click())
  await page.waitForFunction(
    () => document.querySelector('.mdr-view h1')?.textContent === 'demo',
    { timeout: 8000 },
  )
  ok(
    page.url().endsWith('/demo/') &&
      (await page.$eval('.mdr-side-head b', b => b.textContent)) === 'demo',
    'in sub, "Parent folder": back to demo, left stays demo, same page',
  )
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-tree a')
  await sleep(1200)
  await page.screenshot({ path: path.join(outDir, 'folder-readme.png') })
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log('page errors:', errors.length, errors.slice(0, 3).join(' / '))
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
