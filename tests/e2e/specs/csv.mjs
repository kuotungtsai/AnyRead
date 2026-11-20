import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
const [exe, ext, dir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const base = 'file:///' + dir.replace(/\\/g, '/')
let pass = 0,
  fail = 0
const ok = (c, m) => {
  c ? pass++ : fail++
  console.log(c ? 'PASS' : 'FAIL', m)
}
const out = path.join(dir, '..', 'csvout')
const dl = path.join(out, 'dl')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(dl, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(out, 'prof-')),
  ignoreDefaultArgs: ['--disable-extensions'],
  defaultViewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
    '--lang=zh-TW',
    '--window-size=1300,950',
  ],
  env: { ...process.env, LANGUAGE: 'zh_TW' },
})
const errors = []
const watch = p => p.on('pageerror', e => errors.push(e.message))
const tablePage = async () => {
  const t = await browser.waitForTarget(
    t => t.url().includes('/table.html?src='),
    { timeout: 8000 },
  )
  const p = await t.page()
  watch(p)
  await p.waitForSelector('.anyread-table', { timeout: 8000 })
  return p
}
const clickDocLink = (page, text) =>
  page.evaluate(
    text =>
      [...document.querySelectorAll('.md-reader__markdown-content a')]
        .find(a => a.textContent === text)
        .click(),
    text,
  )
const paneShows = (page, name) =>
  page.waitForFunction(
    n =>
      document.querySelector('.md-reader__preview-title')?.textContent === n &&
      document.querySelectorAll('.md-reader__preview tbody tr').length > 0,
    { timeout: 15000 },
    name,
  )
const waitUrl = (page, part) =>
  page
    .waitForFunction(p => location.href.includes(p), { timeout: 8000 }, part)
    .catch(() => {})
try {
  const sw = await browser.waitForTarget(t => t.type() === 'service_worker', {
    timeout: 10000,
  })
  const id = new URL(sw.url()).host
  const opt = await browser.newPage()
  await opt.goto(`chrome-extension://${id}/options.html`)
  await opt.evaluate(() =>
    chrome.storage.local.set({ tourDone: true, pageTheme: 'light' }),
  )
  const page = await browser.newPage()
  watch(page)

  // 1. CSV link -> table in the pane
  await page.goto(`${base}/doc.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await clickDocLink(page, 'Sales')
  await paneShows(page, 'sales.csv')
  const pane = await page.evaluate(() => {
    const p = document.querySelector('.md-reader__preview')
    return {
      info: p.querySelector('.anyread-table-info').textContent,
      head: [...p.querySelectorAll('thead th')].map(t => t.textContent),
      cells: [...p.querySelectorAll('tbody tr')].map(r =>
        [...r.children].map(c => c.textContent),
      ),
      numRight: getComputedStyle(p.querySelector('.anyread-table-number'))
        .textAlign,
      url: location.href,
    }
  })
  ok(
    JSON.stringify(pane.head) ===
      JSON.stringify(['', 'Region', 'Product', 'Units', 'Price', 'Note']),
    'header row, byte order mark dropped',
  )
  ok(
    pane.cells.length === 3 &&
      pane.cells[0][2] === '茶葉' &&
      pane.cells[0][5] === 'Lee, A',
    'quoted comma and UTF-8 text',
  )
  ok(
    pane.cells[1][5] === 'said "hi"\nthen left',
    'escaped quotes and a line break inside a cell',
  )
  ok(pane.info === '3 列 · 5 欄', 'summary: ' + pane.info)
  ok(pane.numRight === 'right', 'numbers right aligned')
  ok(pane.url.endsWith('/doc.md'), 'the document stays on the left')
  await sleep(400)
  await page.screenshot({ path: path.join(out, 'pane.png') })

  // 2. Markdown links still preview Markdown; back returns to the CSV
  await clickDocLink(page, 'Other doc')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.md-reader__preview h1')
        ?.textContent.includes('Other'),
    { timeout: 8000 },
  )
  ok(true, 'a Markdown link still opens Markdown in the pane')
  await page.click('.md-reader__preview-bar button[data-act="back"]')
  await paneShows(page, 'sales.csv')
  ok(true, 'pane back returns to the CSV')

  // 3. "Open in a new tab" -> table page; download keeps the bytes
  await page.click('.md-reader__preview-bar button[data-act="open"]')
  const t1 = await tablePage()
  const p1 = await t1.evaluate(() => ({
    name: document.getElementById('name').textContent,
    rows: document.querySelectorAll('tbody tr').length,
    btn: document.getElementById('download').textContent,
    title: document.title,
    info: document.querySelector('.anyread-table-info').textContent,
  }))
  ok(
    p1.name === 'sales.csv' && p1.rows === 3 && p1.title === 'sales.csv',
    'table page in a new tab',
  )
  ok(
    p1.btn === '下載' && p1.info === '3 列 · 5 欄',
    'Chinese labels: ' + p1.btn + ' / ' + p1.info,
  )
  await sleep(300)
  await t1.screenshot({ path: path.join(out, 'page.png') })
  const c1 = await t1.createCDPSession()
  await c1.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dl,
  })
  await t1.click('#download')
  let got = null
  for (let i = 0; i < 40 && !got; i++) {
    await sleep(200)
    const f = path.join(dl, 'sales.csv')
    if (fs.existsSync(f)) got = fs.readFileSync(f)
  }
  ok(
    got &&
      Buffer.compare(
        got,
        fs.readFileSync(path.join(dir, 'data', 'sales.csv')),
      ) === 0,
    'download is the same bytes as the file',
  )
  await t1.close()

  // 4. "Open here" -> table page in this tab; browser back -> document
  await page.bringToFront()
  await page.click('.md-reader__preview-bar button[data-act="open-here"]')
  await waitUrl(page, 'table.html')
  ok(
    page.url().includes('/table.html?src='),
    'open here shows the table page in this tab',
  )
  await page.goBack()
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 8000,
  })
  ok(page.url().endsWith('/doc.md'), 'browser back returns to the document')

  // 5. Ctrl+click a CSV link -> new tab; Big5 file decoded
  const link = await page.evaluateHandle(() =>
    [...document.querySelectorAll('.md-reader__markdown-content a')].find(
      a => a.textContent === 'Legacy export',
    ),
  )
  await page.keyboard.down('Control')
  await link.click()
  await page.keyboard.up('Control')
  const t2 = await tablePage()
  const big5 = await t2.evaluate(() =>
    [...document.querySelectorAll('thead th, tbody td')].map(
      c => c.textContent,
    ),
  )
  ok(
    JSON.stringify(big5) ===
      JSON.stringify(['', '品名', '數量', '1', '烏龍茶', '12']),
    'Big5 CSV decoded: ' + big5.join('|'),
  )
  ok(page.url().endsWith('/doc.md'), 'ctrl+click keeps the document')
  await t2.close()

  // 6. semicolon CSV and TSV in the pane
  await page.bringToFront()
  await clickDocLink(page, 'Semicolon')
  await paneShows(page, 'semi.csv')
  const semi = await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__preview tbody td')].map(
      c => c.textContent,
    ),
  )
  ok(
    JSON.stringify(semi) === JSON.stringify(['1', '1,5', '2', '3']),
    'semicolon CSV: ' + semi.join('|'),
  )
  await clickDocLink(page, 'Tab separated')
  await paneShows(page, 'list.tsv')
  const tsv = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.md-reader__preview thead th, .md-reader__preview tbody td',
      ),
    ].map(c => c.textContent),
  )
  ok(
    JSON.stringify(tsv) === JSON.stringify(['', 'x', 'y', '1', '1', '2']),
    'TSV: ' + tsv.join('|'),
  )

  // 7. a big file: the pane shows 1000 rows, the page 10000
  await clickDocLink(page, 'Big table')
  await paneShows(page, 'big.csv')
  const bigPane = await page.evaluate(() => ({
    n: document.querySelectorAll('.md-reader__preview tbody tr').length,
    info: document.querySelector('.md-reader__preview .anyread-table-info')
      .textContent,
  }))
  ok(
    bigPane.n === 1000 && bigPane.info.startsWith('12000 列'),
    'pane: ' + bigPane.n + ' rows, ' + bigPane.info,
  )
  await page.click('.md-reader__preview-bar button[data-act="open"]')
  const t3 = await tablePage()
  const bigPage = await t3.evaluate(() => ({
    n: document.querySelectorAll('tbody tr').length,
    info: document.querySelector('.anyread-table-info').textContent,
  }))
  ok(
    bigPage.n === 10000 && bigPage.info.startsWith('12000 列'),
    'page: ' + bigPage.n + ' rows, ' + bigPage.info,
  )
  await t3.close()

  // 8. folder view: click and Enter on CSV entries
  await page.bringToFront()
  await page.goto(`${base}/data/`)
  await page.waitForSelector('.mdr-list a', { timeout: 8000 })
  const icon = await page.evaluate(
    () =>
      [...document.querySelectorAll('.mdr-list a')]
        .find(a => a.textContent.includes('sales.csv'))
        ?.querySelector('.mdr-icon').textContent,
  )
  ok(icon === '📊', 'folder view lists CSV with a table icon')
  // since the folder page has a tree: files open on its right side
  const frameSrc = () =>
    page.evaluate(
      () => document.querySelector('.mdr-frame')?.getAttribute('src') || '',
    )
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')]
      .find(a => a.textContent.includes('sales.csv'))
      .click(),
  )
  await page.waitForFunction(
    () =>
      (
        document.querySelector('.mdr-frame')?.getAttribute('src') || ''
      ).includes('table.html?src='),
    { timeout: 8000 },
  )
  ok(
    (await frameSrc()).includes('sales.csv') && page.url().endsWith('/data/'),
    'folder view click shows the table on the right',
  )
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find(f => f.name() === 'anyread-folder')
    if (
      await f
        ?.evaluate(
          () =>
            !!document.querySelector('.anyread-table') &&
            !document.getElementById('close').hidden,
        )
        .catch(() => false)
    )
      break
    await sleep(200)
  }
  await page
    .frames()
    .find(f => f.name() === 'anyread-folder')
    .click('#close') // back to the file list
  await page.waitForFunction(
    () => !document.querySelector('.mdr-scroll').hidden,
    { timeout: 5000 },
  )
  await page.evaluate(() => {
    const f = document.querySelector('.mdr-bar input[type=search]')
    f.value = 'list.tsv'
    f.dispatchEvent(new Event('input'))
  })
  await sleep(300)
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  for (
    let i = 0;
    i < 40 &&
    !decodeURIComponent(
      page
        .frames()
        .find(f => f.name() === 'anyread-folder')
        ?.url() || '',
    ).includes('list.tsv');
    i++
  )
    await sleep(200)
  if (
    !decodeURIComponent(
      page
        .frames()
        .find(f => f.name() === 'anyread-folder')
        ?.url() || '',
    ).includes('list.tsv')
  )
    throw new Error('list.tsv not in the frame')
  ok(true, 'Enter in folder view shows the file on the right')

  // 9. files tab in the side bar
  await page.goto(`${base}/doc.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await page.evaluate(() =>
    document.querySelectorAll('.md-reader__side-tab')[1].click(),
  )
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.md-reader__files a')].some(a =>
        a.textContent.includes('data'),
      ),
    { timeout: 8000 },
  )
  await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__files a')]
      .find(a => a.textContent.includes('data'))
      .click(),
  )
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.md-reader__files a')].some(a =>
        a.textContent.includes('sales.csv'),
      ),
    { timeout: 8000 },
  )
  await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__files a')]
      .find(a => a.textContent.includes('sales.csv'))
      .click(),
  )
  await waitUrl(page, 'table.html')
  ok(page.url().includes('table.html?src='), 'files tab opens the table page')

  // 12. .txt and the user's code types open in the pane
  await opt.evaluate(() => chrome.storage.local.set({ codeExts: ['py'] }))
  await sleep(500)
  await page.goto(`${base}/doc.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await clickDocLink(page, 'Notes')
  await page.waitForFunction(
    () =>
      document.querySelector('.md-reader__preview-title')?.textContent ===
        'notes.txt' &&
      document.querySelector(
        '.md-reader__preview .md-reader__markdown-content p',
      ),
    { timeout: 8000 },
  )
  const txt = await page.evaluate(() => {
    const c = document.querySelector(
      '.md-reader__preview .md-reader__markdown-content',
    )
    return {
      text: c.textContent,
      br: c.querySelectorAll('br').length,
      url: location.href,
    }
  })
  ok(
    txt.text.includes('Line <two> & "three"') &&
      txt.br === 1 &&
      txt.url.endsWith('/doc.md'),
    '.txt opens in the pane as Markdown, <...> kept as text: ' +
      JSON.stringify(txt.text.slice(0, 40)),
  )
  await clickDocLink(page, 'Script')
  await page.waitForFunction(
    () =>
      document.querySelector('.md-reader__preview-title')?.textContent ===
        'script.py' && document.querySelector('.md-reader__preview pre'),
    { timeout: 8000 },
  )
  const py = await page.evaluate(() => ({
    code: document.querySelector('.md-reader__preview pre').textContent,
    colored: document.querySelectorAll(
      '.md-reader__preview pre [class*=hljs-], .md-reader__preview pre span[style]',
    ).length,
  }))
  ok(
    py.code.includes('def hello') && py.colored > 0,
    '.py (a code type) opens in the pane, highlighted: ' +
      py.colored +
      ' spans',
  )
  await clickDocLink(page, 'Legacy text')
  await page.waitForFunction(
    () =>
      document.querySelector('.md-reader__preview-title')?.textContent ===
        'legacy.txt' &&
      document.querySelector(
        '.md-reader__preview .md-reader__markdown-content p',
      ),
    { timeout: 8000 },
  )
  const leg = await page.evaluate(
    () =>
      document.querySelector('.md-reader__preview .md-reader__markdown-content')
        .textContent,
  )
  ok(
    leg.includes('舊檔案 Big5'),
    'Big5 .txt decoded in the pane: ' + leg.trim(),
  )
  await page.screenshot({ path: path.join(out, 'txt-pane.png') })
  await clickDocLink(page, 'Notes')
  await page.waitForFunction(
    () =>
      document.querySelector('.md-reader__preview-title')?.textContent ===
      'notes.txt',
    { timeout: 8000 },
  )
  await page.click('.md-reader__preview-bar button[data-act="open-here"]')
  await waitUrl(page, 'notes.txt')
  ok(
    page.url().endsWith('/notes.txt'),
    'open here on a .txt opens the file in this tab',
  )
  await opt.evaluate(() => chrome.storage.local.set({ codeExts: [] }))

  // 13. Mermaid .mmd: its own page, the pane, Mermaid plugin switched off
  await page.goto(`${base}/flow.mmd`)
  await page.waitForSelector('.md-reader__markdown-content svg', {
    timeout: 15000,
  })
  const mmd = await page.evaluate(() => ({
    title: document.title,
    text: document.querySelector('.md-reader__markdown-content svg')
      .textContent,
  }))
  ok(
    mmd.title === 'flow.mmd' &&
      mmd.text.includes('開始') &&
      mmd.text.includes('發布'),
    '.mmd page draws the diagram: ' + JSON.stringify(mmd),
  )
  await sleep(500)
  await page.screenshot({ path: path.join(out, 'mmd-page.png') })
  await page.goto(`${base}/doc.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await clickDocLink(page, 'Flow')
  await page.waitForFunction(
    () =>
      document.querySelector('.md-reader__preview-title')?.textContent ===
        'flow.mmd' && document.querySelector('.md-reader__preview svg'),
    { timeout: 15000 },
  )
  ok(page.url().endsWith('/doc.md'), '.mmd opens in the pane as a diagram')
  await sleep(500)
  await page.screenshot({ path: path.join(out, 'mmd-pane.png') })
  const plugins = await opt.evaluate(
    () =>
      new Promise(r =>
        chrome.storage.local.get('mdPlugins', d => r(d.mdPlugins)),
      ),
  )
  await opt.evaluate(
    p =>
      chrome.storage.local.set({
        mdPlugins: (p || ['Emoji']).filter(x => x !== 'Mermaid'),
      }),
    plugins,
  )
  await page.goto(`${base}/flow.mmd`)
  await page
    .waitForSelector('.md-reader__markdown-content svg', { timeout: 15000 })
    .then(
      () => ok(true, '.mmd drawn with the Mermaid plugin off'),
      () => ok(false, '.mmd drawn with the Mermaid plugin off'),
    )
  await opt.evaluate(p => chrome.storage.local.set({ mdPlugins: p }), plugins)
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-list a', { timeout: 8000 })
  const listed = await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')].some(a =>
      a.textContent.includes('flow.mmd'),
    ),
  )
  ok(listed, 'folder view lists .mmd')

  // 11. Excel workbook: pane with sheet tabs, table page, download
  await page.goto(`${base}/doc.md`)
  await page.waitForSelector('.md-reader__markdown-content h1')
  await clickDocLink(page, 'Report')
  await paneShows(page, 'report.xlsx')
  const x = await page.evaluate(() => {
    const p = document.querySelector('.md-reader__preview')
    return {
      tabs: [...p.querySelectorAll('.anyread-sheet-tabs button')].map(
        b => b.textContent,
      ),
      head: [...p.querySelectorAll('thead th')].map(t => t.textContent),
      cells: [...p.querySelectorAll('tbody tr')].map(r =>
        [...r.children].map(c => c.textContent),
      ),
      info: p.querySelector('.anyread-table-info').textContent,
    }
  })
  console.log(JSON.stringify(x))
  ok(
    JSON.stringify(x.tabs) === JSON.stringify(['銷售', 'Notes', 'Hidden']),
    'sheet tabs: ' + x.tabs.join('|'),
  )
  ok(
    x.head.slice(1).join('|') === '地區|產品|數量|單價|比例|日期|時間戳|已出貨',
    'xlsx header',
  )
  ok(
    JSON.stringify(x.cells[0].slice(1)) ===
      JSON.stringify([
        '北區',
        '烏龍茶',
        '120',
        '3.5',
        '12.5%',
        '2026-11-18',
        '2026-11-18 09:30',
        'TRUE',
      ]),
    'xlsx row 1: ' + x.cells[0].join('|'),
  )
  ok(
    x.cells[1][2] === 'Coffee, "dark"' &&
      x.cells[1][8] === 'FALSE' &&
      x.cells[1][5] === '100%',
    'xlsx row 2: ' + x.cells[1].join('|'),
  )
  ok(
    x.cells[2][2] === '多行' + String.fromCharCode(10) + '備註' &&
      x.cells[2][4] === '0.3',
    'xlsx row 3: ' + JSON.stringify(x.cells[2]),
  )
  ok(x.info === '3 列 · 8 欄', 'xlsx summary: ' + x.info)
  await page.evaluate(() =>
    document
      .querySelectorAll('.md-reader__preview .anyread-sheet-tabs button')[1]
      .click(),
  )
  const second = await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__preview thead th')].map(
      t => t.textContent,
    ),
  )
  ok(
    JSON.stringify(second) === JSON.stringify(['', '', '']),
    'second sheet tab (B2 is below an empty header row): ' +
      JSON.stringify(second),
  )
  const second2 = await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__preview tbody td')].map(
      t => t.textContent,
    ),
  )
  ok(
    JSON.stringify(second2) === JSON.stringify(['1', '', 'second sheet']),
    'second sheet cells: ' + JSON.stringify(second2),
  )
  await page.evaluate(() =>
    document
      .querySelectorAll('.md-reader__preview .anyread-sheet-tabs button')[0]
      .click(),
  )
  await sleep(300)
  await page.screenshot({ path: path.join(out, 'xlsx-pane.png') })
  await page.click('.md-reader__preview-bar button[data-act="open"]')
  const t4 = await tablePage()
  const xp = await t4.evaluate(() => ({
    tabs: document.querySelectorAll('.anyread-sheet-tabs button').length,
    rows: document.querySelectorAll('tbody tr').length,
    title: document.title,
  }))
  ok(
    xp.tabs === 3 && xp.rows === 3 && xp.title === 'report.xlsx',
    'xlsx table page: ' + JSON.stringify(xp),
  )
  await sleep(300)
  await t4.screenshot({ path: path.join(out, 'xlsx-page.png') })
  const c4 = await t4.createCDPSession()
  await c4.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dl,
  })
  await t4.click('#download')
  let gx = null
  for (let i = 0; i < 40 && !gx; i++) {
    await sleep(200)
    const f = path.join(dl, 'report.xlsx')
    if (fs.existsSync(f)) gx = fs.readFileSync(f)
  }
  ok(
    gx &&
      Buffer.compare(
        gx,
        fs.readFileSync(path.join(dir, 'data', 'report.xlsx')),
      ) === 0,
    'xlsx download is the same bytes',
  )
  await t4.close()
  await page.bringToFront()
  // a broken workbook shows a message, not an error
  fs.writeFileSync(path.join(dir, 'data', 'broken.xlsx'), 'not a zip')
  await page.goto(
    `chrome-extension://${id}/table.html?src=${encodeURIComponent(
      base + '/data/broken.xlsx',
    )}`,
  )
  await sleep(800)
  const broken = await page.evaluate(
    () => document.getElementById('content').textContent,
  )
  ok(broken.includes('.xlsx'), 'broken workbook message: ' + broken)

  // 10. dark theme; a non-CSV address is refused
  await page.goto(
    `chrome-extension://${id}/table.html?src=${encodeURIComponent(
      base + '/data/sales.csv',
    )}`,
  )
  await page.waitForSelector('.anyread-table')
  await opt.evaluate(() => chrome.storage.local.set({ pageTheme: 'dark' }))
  await page.reload()
  await page.waitForSelector('.anyread-table')
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )
  ok(bg === 'rgb(13, 17, 23)', 'dark theme: ' + bg)
  await page.screenshot({ path: path.join(out, 'page-dark.png') })
  await opt.evaluate(() => chrome.storage.local.set({ pageTheme: 'light' }))
  await page.goto(
    `chrome-extension://${id}/table.html?src=${encodeURIComponent(
      base + '/doc.md',
    )}`,
  )
  await sleep(600)
  const refused = await page.evaluate(() => ({
    text: document.getElementById('content').textContent,
    table: !!document.querySelector('.anyread-table'),
  }))
  ok(
    !refused.table && refused.text.length > 0,
    'non-CSV address refused: ' + refused.text,
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
