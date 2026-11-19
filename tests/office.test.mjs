import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { readOffice } from './.build/office.mjs'
import { parseXml, find, attr, textOf, findAll } from './.build/xml.mjs'

/** a zip file (deflate), enough for these tests; values are text or bytes */
function makeZip(files) {
  const local = []
  const central = []
  let offset = 0
  for (const [name, value] of Object.entries(files)) {
    const nameBytes = Buffer.from(name)
    const raw = Buffer.isBuffer(value) ? value : Buffer.from(value)
    const data = zlib.deflateRawSync(raw)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(8, 8)
    head.writeUInt32LE(data.length, 18)
    head.writeUInt32LE(raw.length, 22)
    head.writeUInt16LE(nameBytes.length, 26)
    local.push(head, nameBytes, data)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(8, 10)
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

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${R}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
const rels = list =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(
      ([id, type, target, ext]) =>
        `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"${
          ext ? ' TargetMode="External"' : ''
        }/>`,
    )
    .join('')}</Relationships>`
const run = (text, rPr = '') =>
  `<w:r>${
    rPr ? `<w:rPr>${rPr}</w:rPr>` : ''
  }<w:t xml:space="preserve">${text}</w:t></w:r>`
const p = (inner, pPr = '') =>
  `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`

function docx(body, extra = {}) {
  return makeZip({
    '_rels/.rels': rels([['rId1', 'officeDocument', 'word/document.xml']]),
    'word/_rels/document.xml.rels': rels([
      ['rId1', 'styles', 'styles.xml'],
      ['rId2', 'numbering', 'numbering.xml'],
      ['rId3', 'footnotes', 'footnotes.xml'],
      ['rId5', 'image', 'media/image1.png'],
      ['rId6', 'image', 'media/image2.emf'],
      ['rId9', 'hyperlink', 'https://example.com/a?b=1&amp;c=2', true],
      ['rId10', 'hyperlink', 'javascript:alert(1)', true],
    ]),
    'word/styles.xml': `<w:styles ${W}>
      <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
      <w:style w:type="paragraph" w:styleId="MyHead"><w:name w:val="Mine"/><w:basedOn w:val="Heading1"/></w:style>
      <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
    </w:styles>`,
    'word/numbering.xml': `<w:numbering ${W}>
      <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
    </w:numbering>`,
    'word/footnotes.xml': `<w:footnotes ${W}>
      <w:footnote w:type="separator" w:id="-1">${p(run('----'))}</w:footnote>
      <w:footnote w:id="1">${p(
        '<w:r><w:footnoteRef/></w:r>' + run(' The note.'),
      )}</w:footnote>
    </w:footnotes>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`,
    'word/media/image1.png': PNG,
    'word/media/image2.emf': Buffer.from('not drawn'),
    ...extra,
  })
}

test('xml: elements, attributes, text, entities, CDATA', () => {
  const root = parseXml(
    '<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b>t &lt;3</b><c/><![CDATA[<raw>]]></a>',
  )
  const a = find(root, 'a')
  assert.equal(attr(a, 'x'), '1 & 2')
  assert.equal(textOf(find(a, 'b')), 't <3')
  assert.equal(findAll(root, 'c').length, 1)
  assert.equal(textOf(a), 't <3<raw>')
})

test('docx: headings, runs, links, tabs', async () => {
  const doc = await readOffice(
    docx(
      p(run('Report'), '<w:pStyle w:val="Title"/>') +
        p(run('Part one'), '<w:pStyle w:val="Heading1"/>') +
        p(run('Based on'), '<w:pStyle w:val="MyHead"/>') +
        p(
          run('Bold', '<w:b/>') +
            run(' plain ') +
            run('not bold', '<w:b w:val="0"/>') +
            '<w:r><w:tab/></w:r>' +
            run('x') +
            run('2', '<w:vertAlign w:val="superscript"/>') +
            '<w:hyperlink r:id="rId9">' +
            run('site', '<w:u w:val="single"/>') +
            '</w:hyperlink>' +
            '<w:hyperlink r:id="rId10">' +
            run('bad') +
            '</w:hyperlink>' +
            '<w:del><w:r><w:delText>gone</w:delText></w:r></w:del>' +
            '<w:ins>' +
            run(' added') +
            '</w:ins>',
          '<w:jc w:val="center"/>',
        ),
    ),
    'file:///C:/a/report.docx',
  )
  assert.equal(doc.kind, 'docx')
  const [t, h1, h2, para] = doc.blocks
  assert.equal(t.head, 1)
  assert.equal(h1.head, 1)
  assert.equal(h2.head, 1, 'heading through basedOn')
  assert.equal(para.align, 'center')
  assert.deepEqual(para.runs, [
    { text: 'Bold', b: true },
    { text: ' plain not bold\tx' },
    { text: '2', sup: true },
    { text: 'site', u: true, href: 'https://example.com/a?b=1&c=2' },
    { text: 'bad added' },
  ])
})

test('docx: lists from numbering and from a list style', async () => {
  const doc = await readOffice(
    docx(
      p(
        run('one'),
        '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
      ) +
        p(
          run('one.a'),
          '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>',
        ) +
        p(run('styled'), '<w:pStyle w:val="ListBullet"/>') +
        p(
          run('first'),
          '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>',
        ) +
        p(
          run('not a list'),
          '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>',
        ),
    ),
    'a.docx',
  )
  assert.deepEqual(
    doc.blocks.map(b => b.list),
    [
      { ordered: false, depth: 0 },
      { ordered: true, depth: 1 },
      { ordered: false, depth: 0 },
      { ordered: true, depth: 0 },
      undefined,
    ],
  )
})

test('docx: tables with merged cells, pictures, footnotes', async () => {
  const cell = (inner, pr = '') =>
    `<w:tc>${pr ? `<w:tcPr>${pr}</w:tcPr>` : ''}${p(run(inner))}</w:tc>`
  const doc = await readOffice(
    docx(
      `<w:tbl><w:tr>${cell('A', '<w:gridSpan w:val="2"/>')}${cell(
        'B',
        '<w:vMerge w:val="restart"/>',
      )}</w:tr>` +
        `<w:tr>${cell('C')}${cell('D')}${cell(
          'hidden',
          '<w:vMerge/>',
        )}</w:tr></w:tbl>` +
        p(
          '<w:r><w:drawing><a:graphic><a:graphicData><a:blip r:embed="rId5"/></a:graphicData></a:graphic></w:drawing></w:r>',
        ) +
        p('<w:r><w:drawing><a:blip r:embed="rId6"/></w:drawing></w:r>') +
        p(run('See') + '<w:r><w:footnoteReference w:id="1"/></w:r>') +
        p('') +
        p(''),
    ),
    'a.docx',
  )
  const [table, pic, emf, note] = doc.blocks
  assert.equal(doc.blocks.length, 4, 'empty paragraphs at the end dropped')
  assert.equal(table.t, 'table')
  assert.equal(table.rows[0][0].span, 2)
  assert.equal(table.rows[0][1].blocks[0].runs[0].text, 'B')
  assert.deepEqual(table.rows[1][2].blocks, [], 'merged cell left empty')
  assert.deepEqual(pic.runs, [{ img: 0 }])
  assert.ok(doc.images[0].startsWith('data:image/png;base64,iVBOR'))
  assert.deepEqual(emf.runs, [{ img: 1 }])
  assert.equal(doc.images[1], '', 'a format browsers cannot draw')
  assert.deepEqual(note.runs, [{ text: 'See' }, { note: 1 }])
  assert.equal(doc.notes.length, 1)
  assert.equal(doc.notes[0][0].runs[0].text, ' The note.')
})

const P = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${R}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`
const sp = (ph, paras) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`
const ap = (text, pPr = '', rPr = '') =>
  `<a:p>${
    pPr ? `<a:pPr ${pPr}/>` : ''
  }<a:r><a:rPr lang="en-US" ${rPr}/><a:t>${text}</a:t></a:r></a:p>`
const slideXml = (tree, show = '') =>
  `<?xml version="1.0"?><p:sld ${P}${show}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${tree}</p:spTree></p:cSld></p:sld>`

function pptx() {
  return makeZip({
    '_rels/.rels': rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]),
    'ppt/presentation.xml': `<p:presentation ${P}><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels([
      ['rId2', 'slide', 'slides/slide1.xml'],
      ['rId3', 'slide', 'slides/slide2.xml'],
    ]),
    'ppt/slides/slide1.xml': slideXml(
      sp('<p:ph type="title"/>', ap('Second slide')) +
        sp(
          '<p:ph idx="1"/>',
          ap('Point A', '', 'b="1"') +
            ap('Sub point', 'lvl="1"') +
            ap('No bullet', '', '').replace(
              '<a:p>',
              '<a:p><a:pPr><a:buNone/></a:pPr>',
            ) +
            '<a:p><a:endParaRPr/></a:p>',
        ) +
        sp('', ap('Free text box')) +
        sp('<p:ph type="sldNum" idx="12"/>', ap('7')) +
        `<p:pic><p:nvPicPr><p:cNvPr id="4" name="p"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>` +
        `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc gridSpan="2"><a:txBody>${ap(
          'Wide',
        )}</a:txBody></a:tc><a:tc hMerge="1"><a:txBody>${ap(
          'x',
        )}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>` +
        `<p:grpSp><p:nvGrpSpPr/><p:grpSpPr/>${sp(
          '',
          ap('In a group'),
        )}</p:grpSp>`,
    ),
    'ppt/slides/_rels/slide1.xml.rels': rels([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'image', '../media/image1.png'],
      ['rId3', 'notesSlide', '../notesSlides/notesSlide1.xml'],
    ]),
    'ppt/notesSlides/notesSlide1.xml': `<p:notes ${P}><p:cSld><p:spTree>${sp(
      '<p:ph type="sldImg"/>',
      '',
    )}${sp(
      '<p:ph type="body" idx="1"/>',
      ap('Say this first'),
    )}</p:spTree></p:cSld></p:notes>`,
    'ppt/slides/slide2.xml': slideXml(
      sp('<p:ph type="ctrTitle"/>', ap('Opening') + ap('Subtitle line')),
      ' show="0"',
    ),
    'ppt/media/image1.png': PNG,
  })
}

test('pptx: slides in order, titles, bullets, pictures, tables, notes', async () => {
  const doc = await readOffice(pptx(), 'deck.pptx')
  assert.equal(doc.kind, 'pptx')
  assert.equal(doc.slides.length, 2)
  const [first, second] = doc.slides
  assert.deepEqual(first.title, [
    { text: 'Opening' },
    { br: true },
    { text: 'Subtitle line' },
  ])
  assert.equal(first.hidden, true)
  assert.deepEqual(second.title, [{ text: 'Second slide' }])
  const [a, sub, plain, free, pic, table, group] = second.blocks
  assert.deepEqual(a, {
    t: 'p',
    runs: [{ text: 'Point A', b: true }],
    list: { ordered: false, depth: 0 },
  })
  assert.deepEqual(sub.list, { ordered: false, depth: 1 })
  assert.equal(plain.list, undefined, 'buNone')
  assert.deepEqual(free, { t: 'p', runs: [{ text: 'Free text box' }] })
  assert.deepEqual(pic.runs, [{ img: 0 }])
  assert.ok(doc.images[0].startsWith('data:image/png;base64,'))
  assert.equal(table.rows[0].length, 1, 'merged cell left out')
  assert.equal(table.rows[0][0].span, 2)
  assert.equal(group.runs[0].text, 'In a group')
  assert.equal(
    second.blocks.length,
    7,
    'slide number and empty paragraph left out',
  )
  assert.deepEqual(second.notes, [
    { t: 'p', runs: [{ text: 'Say this first' }] },
  ])
})

test('not an Office file: an error', async () => {
  await assert.rejects(readOffice(new Uint8Array([1, 2, 3]), 'x.docx'))
  await assert.rejects(readOffice(makeZip({ 'a.txt': 'x' }), 'x.docx'))
})
