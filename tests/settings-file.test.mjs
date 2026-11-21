import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exportSettings,
  readSettingsFile,
  settingsFileName,
} from './.build/settings-file.mjs'

const allowed = {
  languages: ['en', 'zh-TW'],
  themes: ['light', 'dark', 'auto'],
  plugins: ['Emoji', 'Katex', 'Mermaid'],
  configurable: ['Linkify', 'Katex', 'Mermaid'],
}

const stored = {
  enable: true,
  language: 'zh-TW',
  pageTheme: 'dark',
  mdPlugins: ['Katex', 'Mermaid'],
  mdConfig: {
    core: { breaks: true },
    plugins: { Mermaid: { theme: 'forest' } },
  },
  codeExts: ['py', 'c'],
  customCss: 'body { color: red }',
  previewWidth: 0.6,
  // not settings: never exported
  recentFiles: [
    { url: 'file:///C:/secret.md', title: 's', path: 'C:/secret.md', time: 1 },
  ],
  tourDone: true,
  pluginsMigrated: true,
}

test('export keeps settings only, never the recent files', () => {
  const file = exportSettings(stored, '1.2.0', new Date('2026-11-18T08:00:00Z'))
  assert.equal(file.app, 'AnyRead MD')
  assert.equal(file.kind, 'settings')
  assert.equal(file.version, '1.2.0')
  assert.equal(file.exported, '2026-11-18T08:00:00.000Z')
  assert.equal(file.settings.recentFiles, undefined)
  assert.equal(file.settings.tourDone, undefined)
  assert.equal(file.settings.pluginsMigrated, undefined)
  assert.deepEqual(file.settings.codeExts, ['py', 'c'])
  assert.ok(!JSON.stringify(file).includes('secret'))
})

test('a saved file reads back the same', () => {
  const text = JSON.stringify(exportSettings(stored, '1.2.0'))
  const { settings, skipped } = readSettingsFile(text, allowed)
  assert.deepEqual(skipped, [])
  assert.equal(settings.language, 'zh-TW')
  assert.equal(settings.pageTheme, 'dark')
  assert.deepEqual(settings.mdPlugins, ['Katex', 'Mermaid'])
  assert.deepEqual(settings.mdConfig, {
    core: { breaks: true },
    plugins: { Mermaid: { theme: 'forest' } },
  })
  assert.equal(settings.customCss, 'body { color: red }')
  assert.equal(settings.previewWidth, 0.6)
})

test('bad values and unknown keys are left out', () => {
  const text = JSON.stringify({
    app: 'AnyRead MD',
    kind: 'settings',
    settings: {
      enable: 'yes',
      language: 'xx',
      pageTheme: 'neon',
      sideTab: 'files',
      previewWidth: 5,
      mdPlugins: ['Emoji', 'Evil'],
      mdConfig: {
        core: { html: 'true', linkify: false },
        plugins: { Evil: { a: 1 }, Katex: [1] },
      },
      codeExts: ['py', '*', 'html'],
      recentFiles: [{ url: 'file:///x' }],
      tourDone: false,
      constructor: 1,
    },
  })
  const { settings, skipped } = readSettingsFile(text, allowed)
  assert.deepEqual(settings, {
    sideTab: 'files',
    mdPlugins: ['Emoji'],
    mdConfig: { core: { linkify: false }, plugins: {} },
    codeExts: ['py'],
  })
  assert.deepEqual(
    skipped.sort(),
    [
      'constructor',
      'enable',
      'language',
      'pageTheme',
      'previewWidth',
      'recentFiles',
      'tourDone',
    ].sort(),
  )
})

test('not a settings file', () => {
  assert.throws(() => readSettingsFile('hello', allowed))
  assert.throws(() => readSettingsFile('{"a":1}', allowed))
  assert.throws(() =>
    readSettingsFile(
      JSON.stringify({ app: 'Other', kind: 'settings', settings: {} }),
      allowed,
    ),
  )
  assert.throws(() => readSettingsFile('x'.repeat(2_000_000), allowed))
})

test('file name', () => {
  assert.equal(
    settingsFileName(new Date(2026, 10, 8)),
    'anyread-settings-2026-11-08.json',
  )
})
