import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeText,
  guessDelimiter,
  isTableName,
  legacyEncoding,
  parseDelimited,
  readLimited,
  tablePageUrl,
  tableSource,
} from './.build/table.mjs'

test('CSV and TSV files are table files', () => {
  assert.ok(isTableName('file:///C:/data/sales.csv'))
  assert.ok(isTableName('report.TSV'))
  assert.ok(isTableName('file:///C:/data/a%20b.csv#top'))
  assert.ok(!isTableName('notes.md'))
  assert.ok(!isTableName('csv'))
})

test('plain rows, with and without a final line break', () => {
  assert.deepEqual(parseDelimited('a,b\n1,2\n').rows, [
    ['a', 'b'],
    ['1', '2'],
  ])
  assert.deepEqual(parseDelimited('a,b\r\n1,2').rows, [
    ['a', 'b'],
    ['1', '2'],
  ])
})

test('quoted fields keep commas, quotes and line breaks', () => {
  const t = parseDelimited('name,note\r\n"Lee, A","said ""hi""\nthen left"\r\n')
  assert.deepEqual(t.rows, [
    ['name', 'note'],
    ['Lee, A', 'said "hi"\nthen left'],
  ])
})

test('empty fields, ragged rows and the byte order mark', () => {
  const t = parseDelimited('\ufeffa,b,c\n1,,3\n4\n')
  assert.deepEqual(t.rows, [['a', 'b', 'c'], ['1', '', '3'], ['4']])
  assert.equal(t.columns, 3)
  assert.deepEqual(parseDelimited('').rows, [])
  assert.deepEqual(parseDelimited('a,\n').rows, [['a', '']])
})

test('row limit', () => {
  const t = parseDelimited('1\n2\n3\n4\n', ',', 2)
  assert.deepEqual(t.rows, [['1'], ['2']])
  assert.equal(t.truncated, true)
  assert.equal(parseDelimited('1\n2\n', ',', 2).truncated, false)
})

test('delimiter guess', () => {
  assert.equal(guessDelimiter('a,b,c\n1,2,3'), ',')
  assert.equal(guessDelimiter('a;b;c\n1,5;2;3'), ';')
  assert.equal(guessDelimiter('"x,y";b;c'), ';')
  assert.equal(guessDelimiter('a\tb'), '\t')
  assert.equal(guessDelimiter('a,b', 'tsv'), '\t')
  assert.equal(guessDelimiter('single'), ',')
})

test("UTF-8 first, then the language's spreadsheet encoding", () => {
  const utf8 = new TextEncoder().encode('品名,數量')
  assert.equal(decodeText(utf8, 'zh-TW'), '品名,數量')
  // "品名" in Big5
  const big5 = new Uint8Array([0xab, 0x7e, 0xa6, 0x57])
  assert.equal(decodeText(big5, 'zh-TW'), '品名')
  assert.equal(legacyEncoding('zh-TW'), 'big5')
  assert.equal(legacyEncoding('zh-CN'), 'gbk')
  assert.equal(legacyEncoding('ja'), 'shift_jis')
  assert.equal(legacyEncoding('en-US'), 'windows-1252')
})

test('table page address round trip', () => {
  const file = 'file:///C:/data/%E5%A0%B1%E8%A1%A8 2026.csv#x'
  const page = tablePageUrl('chrome-extension://abc/', file)
  assert.ok(page.startsWith('chrome-extension://abc/table.html?src='))
  assert.equal(tableSource(page), 'file:///C:/data/%E5%A0%B1%E8%A1%A8 2026.csv')
  assert.equal(tableSource('chrome-extension://abc/table.html'), '')
})

test('readLimited stops at the limit instead of reading a huge file', async () => {
  const body = () => new Response(new Uint8Array(10).fill(65))
  assert.equal(await readLimited(body(), 9), null)
  assert.deepEqual([...(await readLimited(body(), 10))], new Array(10).fill(65))
  // a size header over the limit is refused before reading
  const sized = new Response('abc', { headers: { 'content-length': '999' } })
  assert.equal(await readLimited(sized, 10), null)
})
