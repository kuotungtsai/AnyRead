/**
 * puppeteer-core, with what every spec needs on any machine:
 *
 * - the interface language fixed to Traditional Chinese (specs compare the
 *   texts they see), whatever the computer's own language is;
 * - E2E_HEADLESS=1     run without windows (new headless mode, which loads
 *                      extensions); for machines without a display
 * - E2E_NO_SANDBOX=1   add --no-sandbox, for systems that block Chromium's
 *                      sandbox (some Linux setups, containers)
 * - E2E_CHROME_ARGS    more Chrome flags, separated by spaces
 * - a clean end: Chrome is killed when the spec exits. Specs give it a few
 *   seconds to close; one still closing kept the spec's output open and
 *   the runner waited for it (minutes, on a busy computer), and its late
 *   pipe errors ("EPIPE") marked a spec failed after it had passed.
 *
 * Specs import this instead of puppeteer-core.
 */
import puppeteer from 'puppeteer-core'

const LANG = 'zh-TW'

let closing = false
const browsers = new Set()

// Errors of a pipe to a browser that is going away: expected once the spec
// has started to close it, a real problem before that.
const SHUTDOWN_NOISE =
  /EPIPE|ECONNRESET|socket has been ended|Target closed|Connection closed|Session closed/i
process.on('uncaughtException', e => {
  if (closing && SHUTDOWN_NOISE.test(String(e?.message || e))) return
  console.log('FAIL uncaught error:', e?.stack || e)
  process.exit(1)
})
// process.exit() runs these synchronously: no Chrome outlives its spec
process.on('exit', () => {
  for (const b of browsers) {
    try {
      b.process()?.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
})

export default {
  async launch(opts = {}) {
    const args = (opts.args || []).filter(a => !a.startsWith('--lang='))
    args.push(`--lang=${LANG}`)
    if (process.env.E2E_NO_SANDBOX === '1') args.push('--no-sandbox')
    if (process.env.E2E_CHROME_ARGS) {
      args.push(...process.env.E2E_CHROME_ARGS.split(/\s+/).filter(Boolean))
    }
    const locale = LANG.replace('-', '_')
    const browser = await puppeteer.launch({
      ...opts,
      headless: process.env.E2E_HEADLESS === '1' ? true : opts.headless,
      args,
      // Windows takes --lang; Linux and macOS take the environment
      env: {
        ...process.env,
        ...(opts.env || {}),
        LANGUAGE: locale,
        LANG: `${locale}.UTF-8`,
      },
    })
    browsers.add(browser)
    const close = browser.close.bind(browser)
    browser.close = () => {
      closing = true
      return close()
    }
    return browser
  },
}
