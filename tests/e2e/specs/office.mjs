// Word and PowerPoint files: in the pane, on the table page, on the folder page.
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
    chrome.storage.local.set({
      pageTheme: 'light',
      tourDone: true,
      previewWidth: 0.55,
    }),
  )
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))

  // 1. pane: the Word file
  await page.goto(`${base}/index.md`)
  await page.waitForSelector(
    '.md-reader__markdown-content a[href$="report.docx"]',
  )
  await sleep(400)
  await page.click('.md-reader__markdown-content a[href$="report.docx"]')
  await waitFor(
    () =>
      page.evaluate(
        () =>
          !!document.querySelector('.md-reader__preview .anyread-office--docx'),
      ),
    'docx in pane',
  )
  const d = await page.evaluate(() => {
    const r = document.querySelector('.md-reader__preview .anyread-office')
    return {
      h1: r.querySelector('h1')?.textContent,
      h2: [...r.querySelectorAll('h2')].map(h => h.textContent),
      ul: r.querySelectorAll(':scope > ul > li').length,
      nested: r.querySelectorAll(':scope > ul ul > li').length,
      ol: r.querySelectorAll(':scope > ol > li').length,
      cells: r.querySelectorAll('table td').length,
      img: r.querySelector('img')?.src.slice(0, 22),
      strong: r.querySelector('strong')?.textContent,
      link: r.querySelector('a')?.getAttribute('href'),
      linkTarget: r.querySelector('a')?.target,
      note: r.querySelector('.anyread-office-notes li')?.textContent.trim(),
      ref: r.querySelector('.anyread-office-ref')?.textContent,
    }
  })
  ok(
    d.h1 === 'Sync service: design review' &&
      d.h2.includes('Goals') &&
      d.ul === 2 &&
      d.nested === 1 &&
      d.ol === 3 &&
      d.cells === 9 &&
      d.img === 'data:image/png;base64,' &&
      d.strong === 'delivery' &&
      d.link === 'http://127.0.0.1:9/project' &&
      d.linkTarget === '_blank' &&
      d.ref === '1' &&
      d.note === 'Figures from the last two releases.',
    'docx in the pane: ' + JSON.stringify(d),
  )
  await page.screenshot({ path: `${outDir}/docx-pane.png` })

  // 2. pane: the PowerPoint file
  await page.click('.md-reader__markdown-content a[href$="deck.pptx"]')
  await waitFor(
    () =>
      page.evaluate(
        () =>
          !!document.querySelector('.md-reader__preview .anyread-office--pptx'),
      ),
    'pptx in pane',
  )
  const s = await page.evaluate(() =>
    [...document.querySelectorAll('.md-reader__preview .anyread-slide')].map(
      sec => ({
        no: sec.querySelector('.anyread-slide-no').textContent,
        title: sec.querySelector('.anyread-slide-title')?.textContent,
        items: sec.querySelectorAll('li').length,
        notes: sec.querySelector('.anyread-slide-notes')?.textContent || '',
        hidden: sec.classList.contains('anyread-slide--hidden'),
        img: !!sec.querySelector('img'),
      }),
    ),
  )
  ok(
    s.length === 3 &&
      s[0].no === '第 1 張' &&
      s[0].title === 'Sync service 2.7' &&
      s[0].notes.includes('Welcome everyone') &&
      s[1].items === 3 &&
      s[1].img &&
      s[2].hidden &&
      s[2].no.includes('已隱藏'),
    'pptx in the pane: ' + JSON.stringify(s),
  )
  await page.screenshot({ path: `${outDir}/pptx-pane.png` })

  // 3. "Open in a new tab": the table page, with Download
  const newTab = browser.waitForTarget(t => t.url().includes('table.html'), {
    timeout: 8000,
  })
  await page.click('.md-reader__preview-bar button[data-act="open"]')
  const tp = await (await newTab).page()
  await tp.waitForSelector('.anyread-office--pptx', { timeout: 8000 })
  const tinfo = await tp.evaluate(() => ({
    title: document.title,
    download: !document.getElementById('download').disabled,
    close: document.getElementById('close').hidden,
    slides: document.querySelectorAll('.anyread-slide').length,
  }))
  ok(
    tinfo.title === 'deck.pptx' &&
      tinfo.download &&
      tinfo.close &&
      tinfo.slides === 3,
    'table page shows the deck, Download on, no Close: ' +
      JSON.stringify(tinfo),
  )
  await tp.setViewport({ width: 1280, height: 800 })
  await sleep(300)
  await tp.screenshot({ path: `${outDir}/pptx-page.png` })
  await tp.close()

  // 4. a broken file: a message, no crash
  await page.bringToFront()
  await page.click('.md-reader__markdown-content a[href$="broken.docx"]')
  await waitFor(
    () =>
      page.evaluate(() =>
        /無法|錯誤|讀取/.test(
          document.querySelector(
            '.md-reader__preview article, .md-reader__preview',
          )?.textContent || '',
        ),
      ),
    'broken in pane',
  )
  ok(true, 'broken .docx in the pane: an error line')
  await page.goto(
    `chrome-extension://${id}/table.html?src=${encodeURIComponent(
      base + '/broken.docx',
    )}`,
  )
  await waitFor(
    () =>
      page.evaluate(() =>
        document
          .getElementById('content')
          .textContent.includes('.docx 和 .pptx'),
      ),
    'broken page',
  )
  ok(true, 'broken .docx on the table page: "only .docx and .pptx" message')

  // 5. folder page: icons, a file opens in the main column, Close back
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-list a')
  const icons = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.mdr-list a')].map(a => [
        a.querySelector('.mdr-name').textContent,
        a.querySelector('.mdr-icon').textContent,
      ]),
    ),
  )
  ok(
    icons['report.docx'] === '📑' && icons['deck.pptx'] === '📑',
    'folder list icons: ' + JSON.stringify(icons),
  )
  await page.evaluate(() =>
    [...document.querySelectorAll('.mdr-list a')]
      .find(a => a.textContent.includes('report.docx'))
      .click(),
  )
  const fr = () => page.frames().find(f => f.name() === 'anyread-folder')
  await waitFor(
    () =>
      fr().evaluate(
        () =>
          !!document.querySelector('.anyread-office--docx') &&
          !document.getElementById('close').hidden,
      ),
    'docx in folder',
  )
  ok(true, 'report.docx in the folder page, with Close')
  await page.screenshot({ path: `${outDir}/docx-folder.png` })
  await fr().click('#close')
  await waitFor(
    () => page.evaluate(() => !document.querySelector('.mdr-scroll').hidden),
    'closed',
  )
  ok(true, 'Close: back to the list')

  // 6. settings: Word and PowerPoint in the built-in list
  await opt.bringToFront()
  await opt.reload()
  await opt.waitForSelector('.ext-form')
  ok(
    await opt.evaluate(() =>
      document
        .querySelector('.ext-form')
        .closest('.file-types')
        .textContent.includes('Word, PowerPoint (docx, pptx)'),
    ),
    'settings lists Word, PowerPoint as built in',
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
