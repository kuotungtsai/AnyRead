// The review fixes: other pages' frames, tree mark for tables, size limits,
// live theme on the folder page.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
const [exe, ext, demo, big, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = 'file:///' + demo.replace(/\\/g, '/')
const bigBase = 'file:///' + big.replace(/\\/g, '/')
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
  defaultViewport: { width: 1400, height: 800 },
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

  // 1. another page's frames: the files stay as they are
  await page.goto(`${bigBase}/host.html`)
  await sleep(2500)
  for (const f of page.frames().filter(f => f !== page.mainFrame())) {
    const r = await f.evaluate(() => ({
      reader: !!document.querySelector('.md-reader__markdown-content'),
      pre: !!document.querySelector('body > pre'),
      visible: document.querySelector('body > pre')
        ? getComputedStyle(document.querySelector('body > pre')).visibility
        : '',
    }))
    ok(
      !r.reader && r.pre && r.visible === 'visible',
      `frame in another page left as is (${f.url().split('/').pop()}): ` +
        JSON.stringify(r),
    )
  }
  // the same files opened on their own are still reader pages
  await page.goto(`${bigBase}/note.txt`)
  ok(
    !!(await page.waitForSelector('.md-reader__markdown-content', {
      timeout: 8000,
    })),
    '.txt on its own page is still a reader page',
  )

  // 2. folder page: pane's "Open here" on a CSV → table page in the frame, tree marks data.csv
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-tree a')
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')]
      .find(a => a.querySelector('.mdr-name').textContent === 'README.md')
      .click(),
  ) // the list comes first now
  const fr = () => page.frames().find(f => f.name() === 'anyread-folder')
  await waitFor(
    async () =>
      !!(await fr()?.$('.md-reader__markdown-content a[href$="data.csv"]')),
    'readme in frame',
  )
  ok(true, 'right side is the named folder frame')
  await (
    await fr().$('.md-reader__markdown-content a[href$="data.csv"]')
  ).click()
  await waitFor(
    () =>
      fr().evaluate(
        () => !!document.querySelector('.md-reader__preview .anyread-table'),
      ),
    'csv in pane',
  )
  await fr().click('.md-reader__preview-bar button[data-act="open-here"]')
  await waitFor(
    () => Promise.resolve(fr().url().includes('table.html')),
    'table page in frame',
  )
  await waitFor(
    () =>
      page.evaluate(() =>
        (history.state?.anyreadView?.shown || '').endsWith('data.csv'),
      ),
    'page knows the csv is shown',
  )
  ok(true, 'table page in the frame: the folder page records data.csv')

  // 3. live theme on the folder page
  await opt.evaluate(() => chrome.storage.local.set({ pageTheme: 'dark' }))
  await waitFor(
    () =>
      page.evaluate(() => document.documentElement.dataset.theme === 'dark'),
    'dark',
    20,
  )
  ok(true, 'folder page turns dark when the setting changes')
  await opt.evaluate(() => chrome.storage.local.set({ pageTheme: 'light' }))
  await waitFor(
    () =>
      page.evaluate(() => document.documentElement.dataset.theme === 'light'),
    'light',
    20,
  )
  ok(true, 'and back to light')

  // 4. size limits: pane says too large; table page refuses the xlsx bomb
  await page.goto(`${bigBase}/doc.md`)
  await page.waitForSelector('.md-reader__markdown-content a[href$="big.csv"]')
  await sleep(500)
  await page.click('.md-reader__markdown-content a[href$="big.csv"]')
  await waitFor(
    () =>
      page.evaluate(() =>
        document
          .querySelector('.md-reader__preview article')
          ?.textContent.includes('太大'),
      ),
    'pane too large',
    80,
  )
  ok(true, 'big CSV (21 MB) in the pane: too large message')
  await page.click('.md-reader__markdown-content a[href$="small.csv"]')
  await waitFor(
    () =>
      page.evaluate(
        () =>
          document.querySelectorAll(
            '.md-reader__preview .anyread-table tbody tr',
          ).length === 1,
      ),
    'small csv',
  )
  ok(true, 'small CSV still shows in the pane')
  await page.click('.md-reader__markdown-content a[href$="bomb.xlsx"]')
  await waitFor(
    () =>
      page.evaluate(() =>
        document
          .querySelector('.md-reader__preview article')
          ?.textContent.includes('太大'),
      ),
    'pane bomb',
    80,
  )
  ok(true, 'xlsx unpacking to 80 MB in the pane: too large message')
  await page.goto(
    `chrome-extension://${id}/table.html?src=${encodeURIComponent(
      bigBase + '/bomb.xlsx',
    )}`,
  )
  await waitFor(
    () =>
      page.evaluate(() =>
        document.getElementById('content').textContent.includes('太大'),
      ),
    'page bomb',
    80,
  )
  ok(true, 'xlsx bomb on the table page: too large message')
  await page.goto(
    `chrome-extension://${id}/table.html?src=${encodeURIComponent(
      bigBase + '/big.csv',
    )}`,
  )
  await waitFor(
    () =>
      page.evaluate(
        () => document.querySelectorAll('.anyread-table tbody tr').length > 100,
      ),
    'big csv page',
    100,
  )
  ok(
    true,
    'big CSV (21 MB) on the table page still shows (limit there is 100 MB)',
  )
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log('page errors:', errors.length, errors.slice(0, 3).join(' / '))
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
