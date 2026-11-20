// Settings file: save to a file, change settings, restore from the file.
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
const [exe, ext, outDir] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0,
  fail = 0
const ok = (c, m) => {
  c ? pass++ : fail++
  console.log(c ? 'PASS' : 'FAIL', m)
}
fs.rmSync(outDir, { recursive: true, force: true })
const dl = path.join(outDir, 'dl')
fs.mkdirSync(dl, { recursive: true })
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
  const page = await browser.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`chrome-extension://${id}/options.html`)
  const store = v =>
    page.evaluate(v => new Promise(r => chrome.storage.local.set(v, r)), v)
  const read = () =>
    page.evaluate(() => new Promise(r => chrome.storage.local.get(null, r)))
  await store({
    tourDone: true,
    pageTheme: 'dark',
    codeExts: ['py', 'c'],
    customCss: 'body{color:red}',
    mdConfig: {
      core: { breaks: true },
      plugins: { Mermaid: { theme: 'forest' } },
    },
    mdPlugins: ['Emoji', 'Katex', 'Mermaid'],
    pluginsMigrated: true,
    previewWidth: 0.6,
    recentFiles: [
      {
        url: 'file:///C:/private/plan.md',
        title: 'Plan',
        path: 'C:/private/plan.md',
        time: 1,
      },
    ],
  })
  await page.reload()
  await page.waitForSelector('.settings-file button')
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('.settings-file button')].map(
      b => b.textContent,
    ),
  )
  ok(
    JSON.stringify(labels) ===
      JSON.stringify(['把設定存成檔案', '從檔案還原…']),
    'buttons: ' + labels.join(' / '),
  )

  // save to a file
  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dl,
  })
  await page.evaluate(() =>
    [...document.querySelectorAll('.settings-file button')][0].click(),
  )
  let saved = null
  for (let i = 0; i < 40 && !saved; i++) {
    await sleep(200)
    const f = fs
      .readdirSync(dl)
      .find(n => /^anyread-md-settings-\d{4}-\d\d-\d\d\.json$/.test(n))
    if (f) saved = path.join(dl, f)
  }
  ok(!!saved, 'settings file downloaded: ' + (saved && path.basename(saved)))
  const json = JSON.parse(fs.readFileSync(saved, 'utf8'))
  ok(
    json.app === 'AnyRead MD' &&
      json.kind === 'settings' &&
      json.version ===
        JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'))
          .version,
    'file header',
  )
  ok(
    json.settings.pageTheme === 'dark' &&
      json.settings.codeExts.join() === 'py,c' &&
      json.settings.mdConfig.plugins.Mermaid.theme === 'forest',
    'settings in the file',
  )
  ok(
    !fs.readFileSync(saved, 'utf8').includes('private') &&
      !('recentFiles' in json.settings) &&
      !('tourDone' in json.settings),
    'no recent files in the file',
  )

  // change settings, then restore from the file
  await store({
    pageTheme: 'light',
    codeExts: [],
    customCss: '',
    mdConfig: { core: {}, plugins: {} },
    mdPlugins: ['Emoji'],
  })
  await page.reload()
  await page.waitForSelector('.settings-file button')
  page.once('dialog', d => d.accept())
  const input = await page.$('.settings-file input[type=file]')
  await input.uploadFile(saved)
  await page.waitForSelector('.import-message', { timeout: 5000 })
  const msg = await page.$eval('.import-message', e => e.textContent)
  ok(
    msg.startsWith('已還原') && !msg.includes('略過'),
    'restore message: ' + msg,
  )
  const after = await read()
  ok(
    after.pageTheme === 'dark' &&
      after.codeExts.join() === 'py,c' &&
      after.customCss === 'body{color:red}',
    'settings restored',
  )
  ok(
    after.mdPlugins.join() === 'Emoji,Katex,Mermaid' &&
      after.mdConfig.plugins.Mermaid.theme === 'forest' &&
      after.previewWidth === 0.6,
    'plugins and options restored',
  )
  ok(after.recentFiles?.length === 1, 'recent files on this computer untouched')
  const shown = await page.evaluate(
    () => document.querySelector('.ext-form input')?.value,
  )
  ok(
    shown === 'py, c',
    'page shows the restored values without reload: ' + shown,
  )
  await page.screenshot({
    path: path.join(outDir, 'settings.png'),
    fullPage: true,
  })

  // background re-registers the code types
  await sleep(800)
  const scripts = await (
    await sw.worker()
  ).evaluate(() => chrome.scripting.getRegisteredContentScripts())
  const code = scripts.find(s => s.id === 'md-reader-code-files')
  ok(
    code && code.matches.some(m => m.endsWith('*.py')),
    'code types registered after restore',
  )

  // cancel keeps everything
  await store({ pageTheme: 'light' })
  page.once('dialog', d => d.dismiss())
  await (await page.$('.settings-file input[type=file]')).uploadFile(saved)
  await sleep(800)
  ok((await read()).pageTheme === 'light', 'cancel leaves settings as they are')

  // a file that is not a settings file
  const bad = path.join(outDir, 'bad.json')
  fs.writeFileSync(bad, JSON.stringify({ hello: 1 }))
  await (await page.$('.settings-file input[type=file]')).uploadFile(bad)
  await sleep(1500)
  await page.waitForFunction(
    () => document.querySelector('.import-message.invalid'),
    { timeout: 5000 },
  )
  const badMsg = await page.$eval('.import-message', e => e.textContent)
  ok(badMsg === '這不是 AnyRead MD 的設定檔。', 'bad file message: ' + badMsg)
  ok((await read()).pageTheme === 'light', 'bad file changes nothing')

  // unknown keys are listed
  const odd = path.join(outDir, 'odd.json')
  fs.writeFileSync(
    odd,
    JSON.stringify({
      app: 'AnyRead MD',
      kind: 'settings',
      settings: { pageTheme: 'auto', recentFiles: [], weird: 1 },
    }),
  )
  page.once('dialog', d => d.accept())
  await (await page.$('.settings-file input[type=file]')).uploadFile(odd)
  await sleep(1500)
  await page.waitForFunction(
    () =>
      document.querySelector('.import-message')?.textContent.includes('略過'),
    { timeout: 5000 },
  )
  const oddMsg = await page.$eval('.import-message', e => e.textContent)
  ok(
    oddMsg.includes('recentFiles') &&
      oddMsg.includes('weird') &&
      (await read()).pageTheme === 'auto',
    'partial restore: ' + oddMsg,
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
