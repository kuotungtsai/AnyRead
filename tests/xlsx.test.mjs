import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import {
  columnIndex,
  excelDate,
  excelNumber,
  formatKind,
  readXlsx,
  unescapeXml,
} from './.build/xlsx.mjs'

/** a zip file (deflate, or stored when `store`), enough for these tests */
function makeZip(files, store = false) {
  const local = []
  const central = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name)
    const raw = Buffer.from(text)
    const data = store ? raw : zlib.deflateRawSync(raw)
    const method = store ? 0 : 8
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(method, 8)
    head.writeUInt32LE(data.length, 18)
    head.writeUInt32LE(raw.length, 22)
    head.writeUInt16LE(nameBytes.length, 26)
    local.push(head, nameBytes, data)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(method, 10)
    dir.writeUInt32LE(data.length, 20)
    dir.writeUInt32LE(raw.length, 24)
    dir.writeUInt16LE(nameBytes.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, nameBytes)
    offset += head.length + nameBytes.length + data.length
  }
  const dirBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dirBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...local, dirBytes, end]))
}

const NS =
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function workbook({ sheets, sharedStrings, styles, date1904 = false }) {
  const files = {
    '_rels/.rels': `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0"?><workbook ${NS}>${
      date1904 ? '<workbookPr date1904="1"/>' : ''
    }<sheets>${sheets
      .map(
        (s, i) =>
          `<sheet name="${s.name}" sheetId="${i + 1}"${
            s.state ? ` state="${s.state}"` : ''
          } r:id="rId${i + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships>${sheets
      .map(
        (s, i) =>
          `<Relationship Id="rId${
            i + 1
          }" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        '',
      )}<Relationship Id="rS" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rT" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
  }
  sheets.forEach((s, i) => {
    files[
      `xl/worksheets/sheet${i + 1}.xml`
    ] = `<?xml version="1.0"?><worksheet ${NS}><sheetData>${s.data}</sheetData></worksheet>`
  })
  if (sharedStrings)
    files[
      'xl/sharedStrings.xml'
    ] = `<?xml version="1.0"?><sst ${NS}>${sharedStrings}</sst>`
  if (styles)
    files[
      'xl/styles.xml'
    ] = `<?xml version="1.0"?><styleSheet ${NS}>${styles}</styleSheet>`
  return files
}

const STYLES =
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy/mm/dd"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/></numFmts>' +
  '<cellXfs count="6"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="9"/><xf numFmtId="165"/><xf numFmtId="22"/></cellXfs>'

test('values of every kind, with shared and rich text', async () => {
  const files = workbook({
    sheets: [
      {
        name: '銷售',
        data:
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Date</t></is></c><c r="D1" t="s"><v>2</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>0.30000000000000004</v></c><c r="C2" s="1"><v>46344</v></c><c r="D2" s="3"><v>0.125</v></c><c r="E2" t="b"><v>1</v></c></row>' +
          // C3 left out: an empty cell in the middle
          '<row r="3"><c r="A3" t="str"><f>A1&amp;"!"</f><v>Region!</v></c><c r="B3" s="4"><v>1234.5</v></c><c r="D3" s="2"><v>45658</v></c><c r="E3" t="e"><v>#DIV/0!</v></c></row>' +
          // row 4 missing; row 5 has a datetime
          '<row r="5"><c r="A5" s="5"><v>46344.5</v></c></row>',
      },
      { name: 'Notes', data: '<row r="1"><c r="B1" t="s"><v>4</v></c></row>' },
      {
        name: 'Secret',
        state: 'veryHidden',
        data: '<row r="1"><c r="A1"><v>1</v></c></row>',
      },
    ],
    sharedStrings:
      '<si><t>Region</t></si><si><t>Units</t></si><si><t>Share</t></si>' +
      '<si><r><rPr><b/></rPr><t>North</t></r><r><t xml:space="preserve"> &amp; East</t></r><rPh><t>ほく</t></rPh></si>' +
      '<si><t>A&lt;B</t></si>',
    styles: STYLES,
  })
  const sheets = await readXlsx(makeZip(files))
  assert.deepEqual(
    sheets.map(s => s.name),
    ['銷售', 'Notes'],
  )
  assert.deepEqual(sheets[0].rows, [
    ['Region', 'Units', 'Date', 'Share'],
    ['North & East', '0.3', '2026-11-18', '12.5%', 'TRUE'],
    ['Region!', '1234.5', '', '2025-01-01', '#DIV/0!'],
    [],
    ['2026-11-18 12:00'],
  ])
  assert.deepEqual(sheets[1].rows, [['', 'A<B']])
})

test('stored (uncompressed) parts and the 1904 date system', async () => {
  const files = workbook({
    sheets: [
      { name: 'S', data: '<row r="1"><c r="A1" s="1"><v>0</v></c></row>' },
    ],
    styles: STYLES,
    date1904: true,
  })
  const sheets = await readXlsx(makeZip(files, true))
  assert.deepEqual(sheets[0].rows, [['1904-01-01']])
})

test('not a workbook', async () => {
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3])))
  await assert.rejects(readXlsx(makeZip({ 'a.txt': 'hello' })))
})

test('number formats', () => {
  assert.equal(formatKind('yyyy/mm/dd'), 'date')
  assert.equal(formatKind('mmm-yy'), 'date')
  assert.equal(formatKind('h:mm'), 'time')
  assert.equal(formatKind('[h]:mm:ss'), 'time')
  assert.equal(formatKind('mm:ss'), 'time')
  assert.equal(formatKind('h:mm AM/PM'), 'time')
  assert.equal(formatKind('m/d/yyyy h:mm AM/PM'), 'datetime')
  assert.equal(formatKind('yyyy-mm-dd hh:mm'), 'datetime')
  assert.equal(formatKind('0.00%'), 'percent')
  assert.equal(formatKind('"$"#,##0.00'), 'number')
  assert.equal(formatKind('[Red]#,##0;[Blue]-#,##0'), 'number')
  assert.equal(formatKind('General'), 'number')
  assert.equal(formatKind('#,##0 "days"'), 'number')
})

test('cells, numbers and text', () => {
  assert.equal(columnIndex('A1'), 0)
  assert.equal(columnIndex('Z9'), 25)
  assert.equal(columnIndex('AA10'), 26)
  assert.equal(columnIndex('XFD1'), 16383)
  assert.equal(excelNumber('0.1000000000000000055511'), '0.1')
  assert.equal(excelNumber('42'), '42')
  assert.equal(excelDate(1, 'date'), '1900-01-01')
  assert.equal(excelDate(46344.75, 'time'), '18:00')
  assert.equal(
    unescapeXml('a &amp; b &#x4E2D; &#25991; _x000D_'),
    'a & b 中 文 \r',
  )
})
