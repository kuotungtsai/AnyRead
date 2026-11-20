/**
 * The made-up files the browser tests read: small Markdown folders, tables,
 * Word / PowerPoint files, a very large CSV and an .xlsx "zip bomb". All
 * content is invented. Written fresh before every run (tests change some).
 *
 *   node tests/e2e/fixtures.mjs <folder>
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

/** a zip file (deflate) from { name: text or bytes } */
export function makeZip(files) {
  const local = []
  const central = []
  let offset = 0
  for (const [name, value] of Object.entries(files)) {
    const nameBytes = Buffer.from(name)
    const raw = Buffer.isBuffer(value) ? value : Buffer.from(value)
    const data = zlib.deflateRawSync(raw)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(8, 8)
    head.writeUInt32LE(zlib.crc32 ? zlib.crc32(raw) : 0, 14)
    head.writeUInt32LE(data.length, 18)
    head.writeUInt32LE(raw.length, 22)
    head.writeUInt16LE(nameBytes.length, 26)
    local.push(head, nameBytes, data)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt32LE(zlib.crc32 ? zlib.crc32(raw) : 0, 16)
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
  return Buffer.concat([...local, dirBytes, end])
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const CT =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
const rels = items =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG}">${items
    .map(
      ([id, type, target, external]) =>
        `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"${
          external ? ' TargetMode="External"' : ''
        }/>`,
    )
    .join('')}</Relationships>`
const esc = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** a small workbook: sheets of rows (strings inline, numbers as numbers) */
function workbook(sheets) {
  const parts = {
    '[Content_Types].xml': CT,
    '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': `<workbook xmlns="${SML}" xmlns:r="${R}"><sheets>${sheets
      .map(
        (s, i) =>
          `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${
            i + 1
          }"/>`,
      )
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': rels(
      sheets.map((_, i) => [
        `rId${i + 1}`,
        'worksheet',
        `worksheets/sheet${i + 1}.xml`,
      ]),
    ),
  }
  sheets.forEach((s, i) => {
    parts[
      `xl/worksheets/sheet${i + 1}.xml`
    ] = `<worksheet xmlns="${SML}"><sheetData>${s.rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">${row
            .map(v =>
              typeof v === 'number'
                ? `<c t="n"><v>${v}</v></c>`
                : `<c t="inlineStr"><is><t>${esc(v)}</t></is></c>`,
            )
            .join('')}</row>`,
      )
      .join('')}</sheetData></worksheet>`
  })
  return makeZip(parts)
}

/** the sample workbook of the CSV / Excel tests: formats, three sheets, one hidden */
function reportXlsx() {
  const t = s => `<is><t>${s}</t></is>`
  const head = [
    '地區',
    '產品',
    '數量',
    '單價',
    '比例',
    '日期',
    '時間戳',
    '已出貨',
  ]
  const cols = 'ABCDEFGH'
  const sheet1 =
    `<worksheet xmlns="${SML}"><sheetData><row r="1">${head
      .map((h, i) => `<c r="${cols[i]}1" t="inlineStr">${t(h)}</c>`)
      .join('')}</row>` +
    `<row r="2"><c r="A2" t="inlineStr">${t(
      '北區',
    )}</c><c r="B2" t="inlineStr">${t(
      '烏龍茶',
    )}</c><c r="C2" t="n"><v>120</v></c><c r="D2" s="1" t="n"><v>3.5</v></c><c r="E2" s="2" t="n"><v>0.125</v></c><c r="F2" s="3" t="n"><v>46344</v></c><c r="G2" s="4" t="n"><v>46344.39583333334</v></c><c r="H2" t="b"><v>1</v></c></row>` +
    `<row r="3"><c r="A3" t="inlineStr">${t(
      '南區',
    )}</c><c r="B3" t="inlineStr">${t(
      'Coffee, "dark"',
    )}</c><c r="C3" t="n"><v>-8</v></c><c r="D3" s="1" t="n"><v>1200</v></c><c r="E3" s="2" t="n"><v>1</v></c><c r="F3" s="3" t="n"><v>45658</v></c><c r="G3" s="4" t="n"><v>45658.75</v></c><c r="H3" t="b"><v>0</v></c></row>` +
    `<row r="4"><c r="A4" t="inlineStr">${t(
      '東區',
    )}</c><c r="B4" t="inlineStr">${t(
      '多行\n備註',
    )}</c><c r="D4" s="1" t="n"><v>0.3</v></c><c r="E4" s="2" t="n"></c></row></sheetData></worksheet>`
  const styles = `<styleSheet xmlns="${SML}"><numFmts count="4"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd h:mm:ss"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="&quot;$&quot;#,##0.00"/></numFmts><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="167"/><xf numFmtId="166"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`
  const sheet = cells =>
    `<worksheet xmlns="${SML}"><sheetData>${cells}</sheetData></worksheet>`
  return makeZip({
    '[Content_Types].xml': CT,
    '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': `<workbook xmlns="${SML}" xmlns:r="${R}"><workbookPr/><sheets><sheet name="銷售" sheetId="1" state="visible" r:id="rId1"/><sheet name="Notes" sheetId="2" state="visible" r:id="rId2"/><sheet name="Hidden" sheetId="3" state="hidden" r:id="rId3"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': rels([
      ['rId1', 'worksheet', '/xl/worksheets/sheet1.xml'],
      ['rId2', 'worksheet', '/xl/worksheets/sheet2.xml'],
      ['rId3', 'worksheet', '/xl/worksheets/sheet3.xml'],
      ['rId4', 'styles', 'styles.xml'],
    ]),
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': sheet1,
    'xl/worksheets/sheet2.xml': sheet(
      '<row r="2"><c r="B2" t="inlineStr"><is><t>second sheet</t></is></c></row>',
    ),
    'xl/worksheets/sheet3.xml': sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>secret</t></is></c></row>',
    ),
  })
}

/** an .xlsx whose sheet unpacks to about 80 MB (a few hundred KB packed) */
function bombXlsx() {
  const pad = '<!--' + 'x'.repeat(80 * 1024 * 1024) + '-->'
  return makeZip({
    '[Content_Types].xml': CT,
    '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': `<workbook xmlns="${SML}" xmlns:r="${R}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': rels([
      ['rId1', 'worksheet', 'worksheets/sheet1.xml'],
    ]),
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${SML}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hi</t></is></c></row></sheetData>${pad}</worksheet>`,
  })
}

/* ---------- Word and PowerPoint ---------- */

const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${R}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`
const wr = (t, pr = '') =>
  `<w:r>${
    pr ? `<w:rPr>${pr}</w:rPr>` : ''
  }<w:t xml:space="preserve">${t}</w:t></w:r>`
const wp = (inner, pr = '') =>
  `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${inner}</w:p>`
const wli = (t, lvl = 0, num = 1) =>
  wp(
    wr(t),
    `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${num}"/></w:numPr>`,
  )
const wtc = t => `<w:tc>${wp(wr(t))}</w:tc>`

function reportDocx() {
  const body =
    wp(wr('Sync service: design review'), '<w:pStyle w:val="Title"/>') +
    wp(wr('Summary'), '<w:pStyle w:val="Heading1"/>') +
    wp(
      wr(
        'The sync service keeps notes up to date on every device. This review covers ',
      ) +
        wr('delivery', '<w:b/>') +
        wr(' and ') +
        wr('retries', '<w:i/>') +
        wr('.') +
        '<w:r><w:footnoteReference w:id="1"/></w:r>',
    ) +
    wp(wr('Goals'), '<w:pStyle w:val="Heading2"/>') +
    wli('Deliver a change within one second') +
    wli('Measured at the 95th percentile', 1) +
    wli('Never lose an edit') +
    wp(wr('Steps'), '<w:pStyle w:val="Heading2"/>') +
    wli('Save the note', 0, 2) +
    wli('Publish the change', 0, 2) +
    wli('Deliver to devices', 0, 2) +
    wp(wr('Numbers'), '<w:pStyle w:val="Heading1"/>') +
    '<w:tbl><w:tr>' +
    wtc('Version') +
    wtc('Crash-free') +
    wtc('p95 (ms)') +
    '</w:tr><w:tr>' +
    wtc('2.6') +
    wtc('99.74%') +
    wtc('340') +
    '</w:tr><w:tr>' +
    wtc('2.7') +
    wtc('99.79%') +
    wtc('330') +
    '</w:tr></w:tbl>' +
    wp(
      '<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
      '<w:jc w:val="center"/>',
    ) +
    wp(
      wr('More at ') +
        '<w:hyperlink r:id="rId9">' +
        wr('the project page', '<w:u w:val="single"/>') +
        '</w:hyperlink>' +
        wr('.'),
    )
  return makeZip({
    '[Content_Types].xml': CT,
    '_rels/.rels': rels([['rId1', 'officeDocument', 'word/document.xml']]),
    'word/_rels/document.xml.rels': rels([
      ['rId1', 'styles', 'styles.xml'],
      ['rId2', 'numbering', 'numbering.xml'],
      ['rId3', 'footnotes', 'footnotes.xml'],
      ['rId5', 'image', 'media/image1.png'],
      // a closed local port: nothing leaves the machine
      ['rId9', 'hyperlink', 'http://127.0.0.1:9/project', true],
    ]),
    'word/styles.xml': `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`,
    'word/numbering.xml': `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
    'word/footnotes.xml': `<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1">${wp(
      wr('-'),
    )}</w:footnote><w:footnote w:id="1">${wp(
      '<w:r><w:footnoteRef/></w:r>' +
        wr(' Figures from the last two releases.'),
    )}</w:footnote></w:footnotes>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`,
    'word/media/image1.png': PNG,
  })
}

const P = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`
const sp = (ph, paras) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`
const ap = (t, lvl = 0, b = false) =>
  `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ''}<a:r><a:rPr lang="en-US"${
    b ? ' b="1"' : ''
  }/><a:t>${t}</a:t></a:r></a:p>`
const slide = (tree, hidden = false) =>
  `<?xml version="1.0"?><p:sld ${P}${
    hidden ? ' show="0"' : ''
  }><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${tree}</p:spTree></p:cSld></p:sld>`
const notes = t =>
  `<p:notes ${P}><p:cSld><p:spTree>${sp(
    '<p:ph type="body" idx="1"/>',
    ap(t),
  )}</p:spTree></p:cSld></p:notes>`

function deckPptx() {
  return makeZip({
    '[Content_Types].xml': CT,
    '_rels/.rels': rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]),
    'ppt/presentation.xml': `<p:presentation ${P}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels([
      ['rId2', 'slide', 'slides/slide1.xml'],
      ['rId3', 'slide', 'slides/slide2.xml'],
      ['rId4', 'slide', 'slides/slide3.xml'],
    ]),
    'ppt/slides/slide1.xml': slide(
      sp('<p:ph type="ctrTitle"/>', ap('Sync service 2.7')) +
        sp('<p:ph type="subTitle" idx="1"/>', ap('Release review')),
    ),
    'ppt/slides/_rels/slide1.xml.rels': rels([
      ['rId3', 'notesSlide', '../notesSlides/notesSlide1.xml'],
    ]),
    'ppt/notesSlides/notesSlide1.xml': notes(
      'Welcome everyone; keep this under ten minutes.',
    ),
    'ppt/slides/slide2.xml': slide(
      sp('<p:ph type="title"/>', ap('What shipped')) +
        sp(
          '<p:ph idx="1"/>',
          ap('Version history per note', 0, true) +
            ap('Older versions kept for 30 days', 1) +
            ap('Smaller install size'),
        ) +
        '<p:pic><p:nvPicPr><p:cNvPr id="4" name="p"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>',
    ),
    'ppt/slides/_rels/slide2.xml.rels': rels([
      ['rId2', 'image', '../media/image1.png'],
      ['rId3', 'notesSlide', '../notesSlides/notesSlide2.xml'],
    ]),
    'ppt/notesSlides/notesSlide2.xml': notes(
      'Mention the beta users who asked for history.',
    ),
    'ppt/slides/slide3.xml': slide(
      sp('<p:ph type="title"/>', ap('Backup slide')) +
        sp('<p:ph idx="1"/>', ap('Only if asked')),
      true,
    ),
    'ppt/media/image1.png': PNG,
  })
}

/* ---------- all of it ---------- */

export function makeFixtures(root) {
  fs.rmSync(root, { recursive: true, force: true })
  const put = (rel, value) => {
    const file = path.join(root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value)
  }

  // demo: a folder with a README, a .txt, a CSV, a diagram and a sub folder
  put(
    'demo/README.md',
    '# Demo project\n\nSee [the notes](notes.txt) and [the data](data.csv).\n',
  )
  put(
    'demo/notes.txt',
    '# Meeting notes\nline one\nline two\n\n- first item\n- second item\n',
  )
  put('demo/data.csv', 'name,qty\napple,3\n')
  put('demo/flow.mmd', 'graph TD\n  A --> B\n')
  put('demo/sub/guide.md', '# Guide\n\nA page in a sub folder.\n')
  put(
    'demo/archive.zip',
    Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]),
  )
  put('demo2/plain.txt', 'just text\nline two\n')

  // pane: Markdown files linking to each other
  put(
    'pane/start.md',
    '# Start\n\nGo to [Alpha](docs/alpha.md).\n\nSome text.\n',
  )
  put(
    'pane/docs/alpha.md',
    '# Alpha\n\nNext: [Beta](beta.md)\n\nBack home: [Start](../start.md)\n',
  )
  put(
    'pane/docs/beta.md',
    '# Beta\n\nNext: [Gamma](gamma.md)\n\n- item [Alpha again](./alpha.md)\n',
  )
  put(
    'pane/docs/gamma.md',
    '# Gamma\n\nEnd. [Beta](beta.md#beta)\n\nSee [Notes](notes.txt).\n',
  )
  put('pane/docs/notes.txt', 'plain notes\n')

  // anchors: long pages with headings linked the way GitHub writes them
  const fill = (label, n) =>
    Array.from({ length: n }, (_, i) => `${label} ${i + 1}\n`).join('\n')
  put(
    'anchors/main.md',
    '# 主文件\n\n跳到 [設定檔與 local.mk](#設定檔與-localmk)。\n\n請看 [說明](terms.md)。\n\n' +
      fill('填充段落', 60) +
      '\n## 設定檔與 local.mk\n\n文字裡的 local.mk 和 setup.py 不是連結，www.example.com 和 https://example.com 還是連結。\n\n' +
      fill('尾段', 40),
  )
  put(
    'anchors/terms.md',
    '# 說明\n\n往下看 [平台設定檔與 local.mk](#平台設定檔與-localmk)。\n\n' +
      fill('段落', 60) +
      '\n## 平台設定檔與 local.mk\n\n內容。\n\n' +
      fill('結尾', 40),
  )

  // csvtest: tables in several shapes and encodings, and other file types
  put(
    'csvtest/doc.md',
    '# Quarterly data\n\n- [Sales](data/sales.csv)\n- [Legacy export](data/big5.csv)\n- [Semicolon](data/semi.csv)\n- [Tab separated](data/list.tsv)\n- [Big table](data/big.csv)\n- [Other doc](other.md)\n- [Report](data/report.xlsx)\n- [Notes](notes.txt)\n- [Script](script.py)\n- [Legacy text](legacy.txt)\n- [Flow](flow.mmd)\n',
  )
  put('csvtest/other.md', '# Other\n\nhello\n')
  put('csvtest/notes.txt', 'Line one\nLine <two> & "three"\n')
  put('csvtest/script.py', 'def hello(name):\n    return f"hi {name}"\n')
  put(
    'csvtest/flow.mmd',
    'flowchart LR\n  A[開始] --> B{檢查}\n  B -->|好| C[發布]\n  B -->|不好| A\n',
  )
  put('csvtest/legacy.txt', Buffer.from('c2c2c0c9aed72042696735', 'hex')) // "舊檔案 Big5" in Big5
  put(
    'csvtest/data/sales.csv',
    '﻿Region,Product,Units,Price,Note\nNorth,茶葉,120,3.50,"Lee, A"\nSouth,Coffee,-8,1200,"said ""hi""\nthen left"\nEast,Cocoa,,9%,\n',
  )
  put(
    'csvtest/data/big5.csv',
    Buffer.from('ab7ea6572cbcc6b6710d0aaf51c073aff92c31320d0a', 'hex'),
  )
  put('csvtest/data/semi.csv', 'a;b;c\n1,5;2;3\n')
  put('csvtest/data/list.tsv', 'x\ty\n1\t2\n')
  put(
    'csvtest/data/big.csv',
    'n,sq\r\n' +
      Array.from({ length: 12000 }, (_, i) => `${i},${i * i}\r\n`).join(''),
  )
  put('csvtest/data/report.xlsx', reportXlsx())
  put('csvtest/data/broken.xlsx', 'not a zip')

  // bigtest: other pages' frames, and files over the size limits
  put(
    'bigtest/host.html',
    '<!doctype html><title>host</title><h1>My own page</h1><iframe id="t" src="note.txt" width="600" height="200"></iframe><iframe id="m" src="doc.md" width="600" height="200"></iframe>',
  )
  put('bigtest/note.txt', '# Not a heading here\nplain text\n')
  put(
    'bigtest/doc.md',
    '# Doc\n\n[big csv](big.csv) and [bomb](bomb.xlsx) and [small](small.csv)\n',
  )
  put('bigtest/small.csv', 'a,b\n1,2\n')
  const line = 'apple,12345,some longer text here to fill the file,xyz\n'
  put(
    'bigtest/big.csv',
    'name,value,comment,more\n' +
      line.repeat(Math.floor((21 * 1024 * 1024) / line.length) + 10),
  )
  put('bigtest/bomb.xlsx', bombXlsx())

  // histtest: folders for Back / Forward, Close and the left column
  const book = () =>
    workbook([
      {
        name: 'Sheet',
        rows: [
          ['fruit', 'count'],
          ['apple', 3],
          ['pear', 5],
        ],
      },
    ])
  put('histtest/start.md', '# Start\n\n[folder](nolist/)\n')
  put('histtest/nolist/a.md', '# A\n\n[to b](b.md)\n')
  put('histtest/nolist/b.md', '# B\n\nBee page.\n')
  put('histtest/nolist/data.csv', 'x,y\n1,2\n')
  put('histtest/nolist/book.xlsx', book())
  put(
    'histtest/nolist/web.md',
    '# Web\n\n[a web site](http://127.0.0.1:9/page) and [b](b.md)\n',
  )
  put('histtest/withreadme/README.md', '# Read me\n\nHello.\n')
  put('histtest/withreadme/book.xlsx', book())

  // cols: nested folders for the two-column folder page
  put('cols/top/A/a1.md', '# A one\n\n[to a2](a2.md)\n')
  put('cols/top/A/a2.md', '# A two\n\nSecond.\n')
  put('cols/top/A/sub/deep.md', '# Deep\n')
  put('cols/top/B/b.md', '# Bee\n')
  put('cols/top/t.md', '# Top\n')
  put('cols/top/data.csv', 'x,y\n1,2\n')

  // officetest: Word and PowerPoint
  put('officetest/report.docx', reportDocx())
  put('officetest/deck.pptx', deckPptx())
  put('officetest/broken.docx', 'this is not a zip file')
  put(
    'officetest/index.md',
    '# Office files\n\n- [the report](report.docx)\n- [the deck](deck.pptx)\n- [broken](broken.docx)\n',
  )

  // linktest: links from a document to other local files
  put('linktest/pic.png', PNG)
  put('linktest/doc.pdf', '%PDF-1.4\n%EOF\n')
  put('linktest/sub/s.md', '# Sub\n')
  put(
    'linktest/links.md',
    '# Links\n\n[picture](pic.png) [pdf](doc.pdf) [folder](sub/) [other md](sub/s.md) [here](#links)\n',
  )

  // mathtest: every way GitHub writes math, and code that only looks like it
  put(
    'mathtest/math.md',
    [
      '# Math',
      '',
      'Dollar inline: $E = mc^2$ and GitHub inline: $`\\sqrt{2}`$.',
      '',
      'Dollar block:',
      '',
      '$$',
      '\\nabla^2 P + k^2 P = 0',
      '$$',
      '',
      'GitHub block:',
      '',
      '```math',
      '\\frac{\\partial P}{\\partial n} = 0',
      '```',
      '',
      'A broken one stays readable:',
      '',
      '```math',
      '\\frac{1}{',
      '```',
      '',
      'Plain code is left alone: `$x$` and',
      '',
      '```js',
      'const price = `$${cost}`',
      '```',
      '',
    ].join('\n'),
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const root = process.argv[2]
  if (!root) {
    console.error('usage: node tests/e2e/fixtures.mjs <folder>')
    process.exit(1)
  }
  makeFixtures(path.resolve(root))
  console.log('fixtures written to', path.resolve(root))
}
