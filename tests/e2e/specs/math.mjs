// Formulas in every way GitHub writes them: $...$, $$...$$, ```math blocks
// and $`...`$ inline. Code that only looks like math is left alone.
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
  defaultViewport: { width: 1100, height: 900 },
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
  await page.goto(`${base}/math.md`)
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 8000,
  })
  await sleep(800)
  const r = await page.evaluate(() => {
    const root = document.querySelector('.md-reader__markdown-content')
    const paras = [...root.querySelectorAll('p')]
    const inline = paras[0]
    return {
      inlineKatex: inline.querySelectorAll('.katex').length,
      inlineHasBacktick: inline.textContent.includes('`'),
      displays: root.querySelectorAll('.katex-display').length,
      mathCode: root.querySelectorAll(
        'code.language-math, pre code[class*="math"]',
      ).length,
      broken: [...root.querySelectorAll('.katex-error')].map(e =>
        e.textContent.trim(),
      ),
      codeSpan: [...root.querySelectorAll('p code')].map(c => c.textContent),
      // the js block, found by what it says (every code block has class hljs)
      jsBlock:
        [...root.querySelectorAll('pre')].find(p =>
          p.textContent.includes('price'),
        )?.textContent || '',
      katexInJs: !!root.querySelector('pre .katex'),
    }
  })
  ok(
    r.inlineKatex === 2 && !r.inlineHasBacktick,
    '$...$ and $`...`$ inline both drawn: ' +
      JSON.stringify({ n: r.inlineKatex, backtick: r.inlineHasBacktick }),
  )
  ok(
    r.displays === 2 && r.mathCode === 0,
    '$$ block and ```math block both drawn, no code block left: ' +
      JSON.stringify({ displays: r.displays, code: r.mathCode }),
  )
  ok(
    r.broken.length === 1 && r.broken[0].includes('\\frac{1}{'),
    'a broken ```math block shows its source, marked as an error: ' +
      JSON.stringify(r.broken),
  )
  ok(
    r.codeSpan.includes('$x$'),
    'inline code `$x$` stays code: ' + JSON.stringify(r.codeSpan),
  )
  ok(
    r.jsBlock.includes('$${cost}') && !r.katexInJs,
    'a js block with $ stays code',
  )
  await page.screenshot({
    path: path.join(outDir, 'math-light.png'),
    fullPage: true,
  })
  await opt.evaluate(() => chrome.storage.local.set({ pageTheme: 'dark' }))
  await page.reload()
  await page.waitForSelector('.md-reader__markdown-content .katex-display', {
    timeout: 8000,
  })
  await sleep(800)
  await page.screenshot({
    path: path.join(outDir, 'math-dark.png'),
    fullPage: true,
  })
  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 2).join(' / '))
} catch (e) {
  fail++
  console.log('FAIL', e.message)
} finally {
  console.log(`passed ${pass}, failed ${fail}`)
  await Promise.race([browser.close(), sleep(4000)])
  process.exit(0)
}
