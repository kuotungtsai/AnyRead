import test from 'node:test'
import assert from 'node:assert/strict'
import {
  matchPatterns,
  originPattern,
  parseExtensions,
  patternsFor,
  textMatcher,
  urlExtension,
  webBases,
} from './.build/file-types.mjs'

test('parseExtensions keeps plain extensions only', () => {
  const { exts, invalid } = parseExtensions('c, .h *.py  md html a/b')
  assert.deepEqual(exts, ['c', 'h', 'py'])
  assert.deepEqual(invalid, ['html', 'a/b'])
})

test('urlExtension reads the last path segment', () => {
  assert.equal(urlExtension('file:///C:/docs/My%20Note.MD?x=1#top'), 'md')
  assert.equal(urlExtension('https://example.com/folder.v2/readme'), '')
})

test('webBases keeps web sites and collapses to all sites', () => {
  assert.deepEqual(webBases(['file:///*', 'https://example.com/*']), [
    'https://example.com/',
  ])
  assert.deepEqual(webBases(['https://example.com/*', '*://*/*']), ['*://*/'])
  assert.deepEqual(webBases(['<all_urls>']), ['*://*/'])
  assert.deepEqual(webBases([]), [])
})

test('patternsFor covers both cases and query strings', () => {
  assert.deepEqual(patternsFor(['md'], ['https://example.com/']), [
    'https://example.com/*.md',
    'https://example.com/*.md?*',
    'https://example.com/*.MD',
    'https://example.com/*.MD?*',
  ])
  assert.deepEqual(patternsFor(['md'], []), [])
})

test('code file types are local only until a site is allowed', () => {
  const local = matchPatterns(['c'])
  assert.ok(local.every(p => p.startsWith('file:///')))
  const withSite = matchPatterns(['c'], ['https://example.com/'])
  assert.ok(withSite.includes('https://example.com/*.c'))
  assert.ok(withSite.includes('file:///*.c'))
})

test('originPattern asks for one site only', () => {
  assert.equal(
    originPattern('https://example.com:8080/a/b.md?x#y'),
    'https://example.com:8080/*',
  )
  assert.equal(originPattern('file:///C:/a.md'), null)
  assert.equal(originPattern('not a url'), null)
})

test('text files for the pane: .txt plus the user code types', () => {
  const isText = textMatcher(['py', 'c'])
  assert.ok(isText('file:///C:/a/notes.txt'))
  assert.ok(isText('main.PY'))
  assert.ok(!isText('readme.md'))
  assert.ok(!isText('data.csv'))
  assert.ok(textMatcher()('a.txt'))
})

test('types AnyRead shows itself never become code types', () => {
  const { exts } = parseExtensions('txt, csv, xlsx, mmd, md, py')
  assert.deepEqual(exts, ['py'])
})

test('parentFolder: up one folder, stopping at a drive, a share or the root', async () => {
  const { parentFolder } = await import('./.build/file-types.mjs')
  assert.equal(parentFolder('file:///C:/docs/notes/'), 'file:///C:/docs/')
  assert.equal(parentFolder('file:///C:/docs/'), 'file:///C:/')
  assert.equal(parentFolder('file:///C:/'), null, 'Windows drive: the top')
  assert.equal(parentFolder('file:///d:/'), null)
  assert.equal(parentFolder('file://server/share/a/'), 'file://server/share/')
  assert.equal(parentFolder('file://server/share/'), null, 'share: the top')
  assert.equal(parentFolder('file:///srv/data/'), 'file:///srv/')
  assert.equal(
    parentFolder('file:///srv/'),
    'file:///',
    'Linux / macOS: up to /',
  )
  assert.equal(parentFolder('file:///'), null, 'the root')
  assert.equal(parentFolder('file:///C:/a%20b/c/'), 'file:///C:/a%20b/')
  assert.equal(parentFolder('not a url'), null)
})

test("codeTypeOf: built-in data / settings types, named files, the user's types", async () => {
  const { codeTypeOf } = await import('./.build/file-types.mjs')
  assert.equal(codeTypeOf('file:///C:/a/data.json'), 'json')
  assert.equal(codeTypeOf('file:///C:/a/x.JSONC'), 'json')
  assert.equal(codeTypeOf('file:///C:/a/app.yml'), 'yaml')
  assert.equal(codeTypeOf('file:///C:/a/pyproject.toml'), 'ini')
  assert.equal(codeTypeOf('file:///C:/a/run.log'), 'plaintext')
  assert.equal(codeTypeOf('file:///C:/a/.gitignore'), 'plaintext')
  assert.equal(codeTypeOf('file:///C:/a/.env'), 'bash')
  assert.equal(codeTypeOf('file:///C:/a/.env.local'), 'bash')
  assert.equal(codeTypeOf('file:///C:/a/Dockerfile'), 'dockerfile')
  assert.equal(codeTypeOf('file:///C:/a/Makefile'), 'makefile')
  assert.equal(codeTypeOf('file:///C:/a/LICENSE'), 'plaintext')
  assert.equal(
    codeTypeOf('file:///C:/a/main.py'),
    null,
    'not added by the user',
  )
  assert.equal(
    codeTypeOf('file:///C:/a/main.py', ['py']),
    'py',
    'highlight.js name for Python',
  )
  assert.equal(codeTypeOf('file:///C:/a/notes.md'), null)
  assert.equal(codeTypeOf('file:///C:/a/README'), null)
})

test('prepareCode: JSON pretty-printed when valid; long files cut on a line', async () => {
  const { prepareCode, MAX_CODE_CHARS } = await import(
    './.build/file-types.mjs'
  )
  assert.equal(
    prepareCode('{"a":[1,2]}', 'x.json').text,
    '{\n  "a": [\n    1,\n    2\n  ]\n}\n',
  )
  assert.equal(
    prepareCode('{"a": 1,', 'x.json').text,
    '{"a": 1,',
    'invalid: as written',
  )
  assert.equal(
    prepareCode('{\n // c\n "a": 1 }', 'x.jsonc').text,
    '{\n // c\n "a": 1 }',
    'jsonc kept',
  )
  const line = 'x'.repeat(99) + '\n'
  const big = line.repeat(Math.ceil((MAX_CODE_CHARS + 500) / 100))
  const r = prepareCode(big, 'run.log')
  assert.equal(r.cut, big.length)
  assert.ok(r.text.length <= MAX_CODE_CHARS && r.text.endsWith('\n'))
  assert.equal(prepareCode('short\n', 'run.log').cut, undefined)
})

test('the manifest opens every built-in data / settings type and named file', async () => {
  const fs = await import('node:fs')
  const { CONFIG_EXTS, CONFIG_NAMES } = await import('./.build/file-types.mjs')
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'),
  )
  const matches = manifest.content_scripts[0].matches
  for (const ext of CONFIG_EXTS) {
    assert.ok(matches.includes(`file://*/*.${ext}`), `missing *.${ext}`)
    assert.ok(
      matches.includes(`file://*/*.${ext.toUpperCase()}`),
      `missing *.${ext.toUpperCase()}`,
    )
  }
  for (const name of Object.keys(CONFIG_NAMES)) {
    assert.ok(
      matches.some(m => m.toLowerCase() === `file://*/*/${name}`),
      `missing ${name}`,
    )
  }
})

test('project root in the folder page address', async () => {
  const { rootFromHash, rootHash, isInside } = await import(
    './.build/file-types.mjs'
  )
  const here = 'file:///C:/p/docs/guide/'
  assert.equal(rootFromHash(here, ''), here)
  assert.equal(rootFromHash(here, '#root=../'), 'file:///C:/p/docs/')
  assert.equal(rootFromHash(here, '#root=../../'), 'file:///C:/p/')
  // past the top of the drive, or anything else: the folder itself
  assert.equal(rootFromHash(here, '#root=../../../../'), here)
  assert.equal(rootFromHash(here, '#root=sub/'), here)
  assert.equal(rootFromHash(here, '#root=..'), here)
  assert.equal(rootFromHash(here, '#mdr-dir=x'), here)
  assert.equal(rootHash(here, here), '')
  assert.equal(rootHash(here, 'file:///C:/p/'), '#root=../../')
  assert.equal(rootHash(here, 'file:///C:/other/'), '')
  // round trip, names with spaces and non-ASCII letters
  const deep = 'file:///C:/my%20notes/%E8%B3%87%E6%96%99/a/'
  const top = 'file:///C:/my%20notes/'
  assert.equal(rootFromHash(deep, rootHash(deep, top)), top)
  assert.ok(isInside(deep, top))
  assert.ok(isInside(top, top))
  assert.ok(!isInside(top, deep))
  assert.ok(!isInside('file:///C:/p2/', 'file:///C:/p/'))
})
