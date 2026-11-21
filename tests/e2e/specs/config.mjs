// Data and settings files shown without adding them in Settings: JSON
// (pretty-printed), YAML, TOML, INI, .env, dotfiles such as .gitignore,
// Dockerfile / Makefile / LICENSE, a large .log shown in part; and the
// folder page's "show hidden files" option, also used by the side bar.
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
  defaultViewport: { width: 1200, height: 800 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
  ],
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
    chrome.storage.local.set({ tourDone: true, pageTheme: 'light' }),
  )
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))

  // what a page shows: our reader (with the file's text), or Chrome's own
  const view = () =>
    page.evaluate(() => {
      const c = document.querySelector('.md-reader__markdown-content')
      return {
        ours: !!c,
        text: c ? c.innerText : document.body.innerText,
        lines: c ? c.innerText.split('\n').length : 0,
        colored: !!c?.querySelector('.md-reader__code-view, pre code.hljs'),
        note:
          document.querySelector('.md-reader__code-note')?.textContent || '',
      }
    })
  const open = async name => {
    await page.goto(`${base}/${name}`)
    await sleep(1200)
    return view()
  }

  // 1. JSON: pretty-printed and coloured
  let v = await open('data.json')
  await page.screenshot({ path: path.join(outDir, 'json.png') })
  ok(
    v.ours && v.colored && v.lines >= 8 && v.text.includes('"nested"'),
    'data.json: our page, coloured, pretty-printed (' + v.lines + ' lines)',
  )
  v = await open('broken.json')
  ok(v.ours && v.text.includes('{"a": 1,'), 'broken.json: shown as written')
  v = await open('settings.jsonc')
  ok(v.ours && v.text.includes('// a comment'), 'settings.jsonc: comments kept')

  // 2. settings files, dotfiles, names without an extension
  for (const [name, says] of [
    ['app.yml', 'items:'],
    ['pyproject.toml', '[project]'],
    ['app.ini', '[main]'],
    ['.env', 'DEBUG=true'],
    ['.gitignore', 'node_modules/'],
    ['Dockerfile', 'FROM node:22'],
    ['Makefile', 'echo hi'],
    ['LICENSE', 'MIT License'],
  ]) {
    v = await open(name)
    ok(v.ours && v.colored && v.text.includes(says), `${name}: our page`)
  }

  // 3. a large log: the first part, with a note
  v = await open('big.log')
  await page.screenshot({ path: path.join(outDir, 'log.png') })
  ok(
    v.ours && v.note.length > 0 && v.text.includes('line 0 of'),
    'big.log: the first part and a note: ' + v.note,
  )

  // 4. the pane: JSON next to a document
  await page.goto(`${base}/index.md`)
  await page.waitForSelector('.md-reader__markdown-content a[href="data.json"]')
  await sleep(400)
  await page.click('.md-reader__markdown-content a[href="data.json"]')
  await page
    .waitForFunction(
      () =>
        (
          document.querySelector('.md-reader__preview')?.innerText || ''
        ).includes('"nested"'),
      { timeout: 6000 },
    )
    .catch(() => {})
  const pane = await page.evaluate(
    () => document.querySelector('.md-reader__preview')?.innerText || '',
  )
  ok(
    pane.includes('"nested"') && pane.split('\n').length >= 8,
    'data.json in the pane, pretty-printed',
  )

  // ... and the other kinds there too: YAML, a dotfile, a name without extension
  for (const [href, says] of [
    ['app.yml', 'items:'],
    ['.gitignore', 'node_modules/'],
    ['Dockerfile', 'FROM node:22'],
  ]) {
    await page.click(`.md-reader__markdown-content a[href="${href}"]`)
    await page
      .waitForFunction(
        s =>
          (
            document.querySelector('.md-reader__preview')?.innerText || ''
          ).includes(s),
        { timeout: 6000 },
        says,
      )
      .catch(() => {})
    const r = await page.evaluate(() => ({
      text: document.querySelector('.md-reader__preview')?.innerText || '',
      coloured: !!document.querySelector('.md-reader__preview pre code.hljs'),
      url: location.href.split('/').pop(),
    }))
    ok(
      r.text.includes(says) && r.coloured && r.url === 'index.md',
      `${href} in the split view, coloured; the document stays`,
    )
  }
  await page.screenshot({ path: path.join(outDir, 'pane.png') })

  // 5. folder page: hidden files off by default, the option shows them
  const names = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.mdr-list a .mdr-name')].map(
        a => a.textContent,
      ),
    )
  await page.goto(`${base}/`)
  await page.waitForSelector('.mdr-list a', { timeout: 8000 })
  let n = await names()
  ok(
    n.includes('data.json') &&
      n.includes('Dockerfile') &&
      !n.includes('.gitignore') &&
      !n.includes('.hidden'),
    'folder page: config files listed, hidden ones not: ' + n.join(' '),
  )
  const box = await page.$('.mdr-bar input[data-opt="hidden"]')
  ok(!!box, 'folder page has a "show hidden files" box')
  if (box) {
    await box.click()
    await sleep(800)
    n = await names()
    ok(
      n.includes('.gitignore') && n.includes('.env') && n.includes('.hidden'),
      'checked: hidden files and folders listed',
    )
    await page.screenshot({ path: path.join(outDir, 'folder-hidden.png') })
    await page.evaluate(() =>
      [...document.querySelectorAll('.mdr-list a')]
        .find(a => a.querySelector('.mdr-name').textContent === '.gitignore')
        .click(),
    )
    const fr = () => page.frames().find(f => f.name() === 'anyread-folder')
    await page
      .waitForFunction(() => !document.querySelector('.mdr-frame').hidden, {
        timeout: 5000,
      })
      .catch(() => {})
    await sleep(1200)
    const inFrame = await fr()
      ?.evaluate(
        () =>
          document.querySelector('.md-reader__markdown-content')?.innerText ||
          '',
      )
      .catch(() => '')
    ok(
      (inFrame || '').includes('node_modules/'),
      '.gitignore opens on the right of the folder page',
    )
    // remembered, and the side bar's Files tab follows it
    await page.reload()
    await page.waitForSelector('.mdr-list a', { timeout: 8000 })
    ok((await names()).includes('.gitignore'), 'remembered after a reload')
    await page.goto(`${base}/index.md`)
    await page.waitForSelector('.md-reader__markdown-content h1')
    await page.evaluate(() =>
      document.querySelectorAll('.md-reader__side-tab')[1].click(),
    )
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('.md-reader__files-list a')].some(a =>
            a.textContent.endsWith('.gitignore'),
          ),
        { timeout: 5000 },
      )
      .catch(() => {})
    ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('.md-reader__files-list a')].some(a =>
          a.textContent.endsWith('.gitignore'),
        ),
      ),
      'the side bar lists hidden files too',
    )
  }

  // 6. settings: listed as built in
  await opt.bringToFront()
  await opt.reload()
  await opt.waitForSelector('.ext-form')
  ok(
    await opt.evaluate(() =>
      document
        .querySelector('.ext-form')
        .closest('.file-types')
        .textContent.includes('JSON'),
    ),
    'settings list JSON among the built-in types',
  )
  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 2).join(' / '))
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
