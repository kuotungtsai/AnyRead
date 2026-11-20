// Real-mouse test of the linked-file pane.
// usage: node pane.mjs <chrome.exe> <extension dir> <pane dir> <out dir>
import puppeteer from '../browser.mjs'
import { pathToFileURL } from 'node:url'
import fs from 'fs'
import path from 'path'

const [exe, ext, mdDir, outDir] = process.argv.slice(2)
const base = pathToFileURL(mdDir).href + '/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0
const check = (name, ok, detail = '') => {
  if (!ok) fails++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`,
  )
}

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(outDir, 'prof-')),
  ignoreDefaultArgs: ['--disable-extensions'],
  defaultViewport: { width: 1400, height: 900 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--no-first-run',
    '--window-size=1420,1000',
  ],
})

try {
  const sw = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().includes('background'),
    { timeout: 15000 },
  )
  const extId = new URL(sw.url()).host
  const extPage = await browser.newPage()
  await extPage.goto('chrome://extensions/')
  await extPage.evaluate(
    id =>
      chrome.developerPrivate.updateExtensionConfiguration({
        extensionId: id,
        fileAccess: true,
      }),
    extId,
  )
  await sleep(1500)
  await extPage.close()

  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base + 'start.md')
  await page.waitForSelector('.md-reader__markdown-content h1', {
    timeout: 10000,
  })
  await sleep(1500)
  if (await page.$('.mdr-tour-card')) await page.keyboard.press('Escape')
  await sleep(300)

  const paneH1 = () =>
    page
      .$eval(
        '.md-reader__preview .md-reader__markdown-content h1',
        e => e.textContent,
      )
      .catch(() => '')
  const clickPaneLink = async text => {
    const link = await page.evaluateHandle(
      t =>
        [...document.querySelectorAll('.md-reader__preview a')].find(
          a => a.textContent.trim() === t,
        ),
      text,
    )
    const el = link.asElement()
    if (!el) return 'no link'
    await el.click() // real mouse click at the element's position
    await sleep(900)
    return 'clicked'
  }
  const bar = async label =>
    page.evaluate(l => {
      const b = [
        ...document.querySelectorAll('.md-reader__preview-bar button'),
      ].find(x => x.dataset.act === l)
      return b
        ? {
            shown: getComputedStyle(b).display !== 'none',
            disabled: b.disabled,
          }
        : null
    }, label)
  const clickBar = async label => {
    const h = await page.$(
      `.md-reader__preview-bar button[data-act="${label}"]`,
    )
    if (!h) return false
    await h.click()
    await sleep(900)
    return true
  }

  // main page link → pane (real click)
  const main = (
    await page.evaluateHandle(() =>
      [...document.querySelectorAll('.md-reader__body a')].find(
        a => a.textContent.trim() === 'Alpha',
      ),
    )
  ).asElement()
  await main.click()
  await sleep(1200)
  check(
    'main link opens Alpha in pane',
    (await paneH1()).includes('Alpha'),
    await paneH1(),
  )
  check('main page still Start', page.url().endsWith('start.md'), page.url())

  console.log('  pane link Beta:', await clickPaneLink('Beta'))
  check(
    'pane link → Beta in pane',
    (await paneH1()).includes('Beta'),
    await paneH1(),
  )
  console.log('  pane link Gamma:', await clickPaneLink('Gamma'))
  check(
    'pane link → Gamma in pane',
    (await paneH1()).includes('Gamma'),
    await paneH1(),
  )
  check('main page untouched', page.url().endsWith('start.md'), page.url())

  // what sits on top of a pane link?
  const top = await page.evaluate(() => {
    const a = document.querySelector('.md-reader__preview a')
    if (!a) return 'no link'
    const r = a.getBoundingClientRect()
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    )
    return hit === a || a.contains(hit)
      ? 'link itself'
      : hit?.outerHTML.slice(0, 120)
  })
  console.log('  element at the pane link:', top)

  // back / forward
  if (await clickBar('back')) {
    check('back → Beta', (await paneH1()).includes('Beta'), await paneH1())
    await clickBar('back')
    check('back → Alpha', (await paneH1()).includes('Alpha'), await paneH1())
    check(
      'back disabled at first file',
      (await bar('back'))?.disabled === true,
      JSON.stringify(await bar('back')),
    )
    await clickBar('forward')
    check('forward → Beta', (await paneH1()).includes('Beta'), await paneH1())
    await clickBar('forward')
    check('forward → Gamma', (await paneH1()).includes('Gamma'), await paneH1())
    check(
      'forward disabled at last file',
      (await bar('forward'))?.disabled === true,
      JSON.stringify(await bar('forward')),
    )
    await clickBar('back')
    await clickPaneLink('Alpha again')
    check(
      'new link after back drops forward history',
      (await bar('forward'))?.disabled === true,
      JSON.stringify(await bar('forward')),
    )
  } else {
    console.log('  (no data-act buttons: old build)')
  }

  // since 1.2: a .txt link inside the pane opens in the pane too
  await clickPaneLink('Beta')
  await clickPaneLink('Gamma')
  console.log('  pane now:', await paneH1())
  const n0 = (await browser.pages()).length
  await clickPaneLink('Notes')
  await sleep(1200)
  const ps = await browser.pages()
  const paneTitle = await page.evaluate(
    () => document.querySelector('.md-reader__preview-title')?.textContent,
  )
  check(
    '.txt link in pane opens in the pane',
    ps.length === n0 && paneTitle === 'notes.txt',
    n0 + ' → ' + ps.length + ', ' + paneTitle,
  )
  check(
    'left document kept after .txt link',
    page.url().endsWith('start.md'),
    page.url(),
  )
  await page.bringToFront()

  // mouse side buttons step through the pane
  const box = await (
    await page.$('.md-reader__preview .md-reader__markdown-content')
  ).boundingBox()
  await page.mouse.move(box.x + 40, box.y + 40)
  const h0 = await paneH1()
  await page.mouse.down({ button: 'back' })
  await page.mouse.up({ button: 'back' })
  await sleep(1000)
  check(
    'mouse back button steps back in the pane',
    (await paneH1()) !== h0 && page.url().endsWith('start.md'),
    h0 + ' → ' + (await paneH1()) + ' / ' + page.url(),
  )
  await page.mouse.down({ button: 'forward' })
  await page.mouse.up({ button: 'forward' })
  await sleep(1000)
  check(
    'mouse forward button steps forward',
    (await paneH1()) === h0,
    await paneH1(),
  )

  // open button → new tab
  const before = (await browser.pages()).length
  if (await clickBar('open')) {
    await sleep(1500)
    const pages = await browser.pages()
    check(
      'open makes a new tab',
      pages.length === before + 1,
      `${before} → ${pages.length}`,
    )
    check(
      'original tab still Start',
      page.url().endsWith('start.md'),
      page.url(),
    )
    const newest = pages[pages.length - 1]
    check(
      'new tab shows the pane file',
      /alpha\.md|beta\.md|gamma\.md|notes\.txt/.test(newest.url()),
      newest.url(),
    )
  }
  await page.bringToFront()
  await page.screenshot({ path: path.join(outDir, 'pane.png') })
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await browser.close()
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
process.exit(fails ? 1 : 0)
