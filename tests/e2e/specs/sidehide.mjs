// Folder page: web links in the shown file open a new tab; the left column hides.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
const [exe, ext, dir, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = 'file:///' + dir.split(String.fromCharCode(92)).join('/')
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
  await page.goto(`${base}/nolist/`)
  await page.waitForSelector('.mdr-list a')

  // 1. web link in the shown file: a new tab, the file stays
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')]
      .find(a => a.querySelector('.mdr-name').textContent === 'web.md')
      .click(),
  )
  await waitFor(
    async () =>
      !!(await fr()?.$('.md-reader__markdown-content a[href^="http"]')),
    'web.md',
  )
  await sleep(300)
  const newTarget = browser.waitForTarget(
    t => t.url().startsWith('http://127.0.0.1:9/'),
    { timeout: 8000 },
  )
  const h = await fr().$('.md-reader__markdown-content a[href^="http"]')
  const b = await h.boundingBox()
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  const tgt = await newTarget
  ok(!!tgt, 'web link: opened in a new tab ' + tgt.url())
  await sleep(500)
  ok(
    fr().url().endsWith('web.md'),
    'the file stays in the folder page: ' + fr().url().split('/').pop(),
  )
  const tp = await tgt.page().catch(() => null)
  if (tp) await tp.close().catch(() => {})
  // a Markdown link still opens the split pane
  const h2 = await fr().$('.md-reader__markdown-content a[href$="b.md"]')
  const b2 = await h2.boundingBox()
  await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2)
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
  ok(true, 'a Markdown link still opens the split pane')

  // 2. hide the left column, remembered across reloads, shown again
  const sideState = () =>
    page.evaluate(() => ({
      off: document.querySelector('.mdr-app').classList.contains('side-off'),
      side: getComputedStyle(document.querySelector('.mdr-side')).display,
      strip: getComputedStyle(document.querySelector('.mdr-strip')).display,
      mainX: Math.round(
        document.querySelector('.mdr-main').getBoundingClientRect().x,
      ),
      hideTitle: document.querySelector('.mdr-side-head .mdr-side-btn').title,
      showTitle: document.querySelector('.mdr-strip .mdr-side-btn').title,
    }))
  const s0 = await sideState()
  ok(
    !s0.off &&
      s0.side !== 'none' &&
      s0.strip === 'none' &&
      s0.mainX === 280 &&
      s0.hideTitle === '隱藏左欄',
    'left column shown at first: ' + JSON.stringify(s0),
  )
  await page.click('.mdr-side-head .mdr-side-btn')
  await sleep(300)
  const s1 = await sideState()
  ok(
    s1.off &&
      s1.side === 'none' &&
      s1.strip === 'flex' &&
      s1.mainX === 34 &&
      s1.showTitle === '顯示左欄',
    '« hides it; a narrow strip with » stays: ' + JSON.stringify(s1),
  )
  await page.screenshot({ path: `${outDir}/side-hidden.png` })
  await page.reload()
  await page.waitForSelector('.mdr-app')
  await sleep(500)
  ok((await sideState()).off, 'still hidden after a reload')
  await page.click('.mdr-strip .mdr-side-btn')
  await sleep(300)
  const s2 = await sideState()
  ok(
    !s2.off && s2.mainX === 280,
    '» shows it again: ' + JSON.stringify({ off: s2.off, mainX: s2.mainX }),
  )
  await page.reload()
  await page.waitForSelector('.mdr-app')
  await sleep(500)
  ok(!(await sideState()).off, 'still shown after a reload')
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log('page errors:', errors.length, errors.slice(0, 3).join(' / '))
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
