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
 *
 * Specs import this instead of puppeteer-core.
 */
import puppeteer from 'puppeteer-core'

const LANG = 'zh-TW'

export default {
  launch(opts = {}) {
    const args = (opts.args || []).filter(a => !a.startsWith('--lang='))
    args.push(`--lang=${LANG}`)
    if (process.env.E2E_NO_SANDBOX === '1') args.push('--no-sandbox')
    if (process.env.E2E_CHROME_ARGS) {
      args.push(...process.env.E2E_CHROME_ARGS.split(/\s+/).filter(Boolean))
    }
    const locale = LANG.replace('-', '_')
    return puppeteer.launch({
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
  },
}
