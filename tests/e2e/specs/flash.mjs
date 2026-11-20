// Folder page reload: Chrome's plain listing is never painted visible
// before AnyRead MD's folder page is ready.
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
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(outDir, 'prof-')),
  ignoreDefaultArgs: ['--disable-extensions'],
  defaultViewport: { width: 1200, height: 700 },
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
  // every animation frame: was Chrome's own listing visible before ours was ready?
  await page.evaluateOnNewDocument(() => {
    window.__seen = []
    const tick = () => {
      const tb = document.querySelector('#tbody')
      if (document.body && tb) {
        const vis = getComputedStyle(document.body).visibility
        window.__seen.push({
          ready: document.documentElement.classList.contains('anyread-ready'),
          vis,
          ours: !!document.querySelector('.mdr-app'),
        })
      }
      if (window.__seen.length < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const check = async label => {
    await page.waitForSelector('.mdr-app', { timeout: 8000 })
    await sleep(500)
    const seen = await page.evaluate(() => window.__seen)
    const raw = seen.filter(f => f.vis === 'visible' && !f.ours)
    ok(
      raw.length === 0 && seen.length > 0,
      `${label}: listing never visible before the folder page (${
        seen.length
      } frames, ${
        seen.filter(f => !f.ours).length
      } before ours, all hidden: ${seen
        .filter(f => !f.ours)
        .every(f => f.vis === 'hidden')}, ${raw.length} raw)`,
    )
    ok(
      await page.evaluate(
        () => getComputedStyle(document.body).visibility === 'visible',
      ),
      `${label}: folder page visible`,
    )
  }
  await page.goto(`${base}/`)
  await check('first open')
  for (let i = 1; i <= 3; i++) {
    await page.reload()
    await check('reload ' + i)
  }
  // folder view turned off: Chrome's listing shows at once (no 2 s wait)
  await opt.evaluate(() => chrome.storage.local.set({ dirView: false }))
  await page.reload()
  await sleep(600)
  ok(
    await page.evaluate(
      () =>
        !document.querySelector('.mdr-app') &&
        getComputedStyle(document.body).visibility === 'visible',
    ),
    'folder view off: Chrome listing shown right away',
  )
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
