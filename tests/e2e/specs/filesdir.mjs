// The side bar's Files tab on a document opened on its own: a folder's name
// opens its folder page, ▸ opens it in place, Ctrl+click opens the folder
// page in a new tab, and the folder name at the top opens that folder.
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

  const openTab = async () => {
    await page.goto(`${base}/README.md`)
    await page.waitForSelector('.md-reader__markdown-content h1', {
      timeout: 8000,
    })
    await page.evaluate(() =>
      document.querySelectorAll('.md-reader__side-tab')[1].click(),
    )
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.md-reader__files-list a')].some(a =>
          a.textContent.endsWith('sub'),
        ),
      { timeout: 8000 },
    )
  }
  // the folder entry "sub": its ▸ and its name, as boxes to click
  const subBoxes = () =>
    page.evaluate(() => {
      const a = [...document.querySelectorAll('.md-reader__files-list a')].find(
        x => x.textContent.endsWith('sub'),
      )
      const box = el => {
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
      return { icon: box(a.firstElementChild), name: box(a.lastElementChild) }
    })

  // 1. ▸ opens the folder in place; the document stays
  await openTab()
  let b = await subBoxes()
  await page.mouse.click(b.icon.x, b.icon.y)
  await sleep(1200)
  const expanded = await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__files-list a')].some(a =>
      a.textContent.endsWith('guide.md'),
    ),
  )
  await page.screenshot({ path: path.join(outDir, 'files-tab.png') })
  ok(
    expanded && page.url().endsWith('/README.md'),
    '▸: sub opens in place, the document stays',
  )

  // 2. the name opens sub's folder page in this tab; Back returns
  b = await subBoxes()
  await page.mouse.click(b.name.x, b.name.y)
  await page
    .waitForFunction(() => location.href.endsWith('/sub/'), { timeout: 8000 })
    .catch(() => {})
  await page.waitForSelector('.mdr-app', { timeout: 8000 }).catch(() => {})
  const folder = await page.evaluate(() => ({
    url: location.href.split('/').slice(-2).join('/'),
    main: document.querySelector('.mdr-view h1')?.textContent || '',
  }))
  ok(
    folder.url === 'sub/' && folder.main === 'sub',
    'the name opens the folder page of sub: ' + JSON.stringify(folder),
  )
  await page.goBack().catch(() => {})
  await page
    .waitForSelector('.md-reader__markdown-content h1', { timeout: 8000 })
    .catch(() => {})
  ok(page.url().endsWith('/README.md'), 'Back: the document again')

  // 3. Ctrl+click on the name: the folder page in a new tab
  await openTab()
  b = await subBoxes()
  const newTab = browser
    .waitForTarget(t => t.url().endsWith('/sub/'), { timeout: 6000 })
    .catch(() => null)
  await page.keyboard.down('Control')
  await page.mouse.click(b.name.x, b.name.y)
  await page.keyboard.up('Control')
  const t = await newTab
  await sleep(500)
  ok(
    !!t && page.url().endsWith('/README.md'),
    'Ctrl+click: sub in a new tab, the document stays',
  )

  // 4. the folder name at the top opens that folder's page
  const head = await page.evaluate(() => {
    const h = document.querySelector('.md-reader__files-title')
    return { tag: h?.tagName, href: h?.getAttribute('href') || '' }
  })
  ok(
    head.tag === 'A' && head.href.endsWith('/demo/'),
    'the folder name at the top is a link to its folder: ' +
      JSON.stringify({
        tag: head.tag,
        end: head.href.split('/').slice(-2).join('/'),
      }),
  )
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
