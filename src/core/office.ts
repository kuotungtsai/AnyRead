/**
 * Word (.docx) and PowerPoint (.pptx) files read for their content, not
 * their layout: headings, paragraphs, lists, tables, links and pictures, and
 * for a presentation each slide's title, text and speaker notes in order.
 * No page layout, text boxes placed on a page, shapes, charts, equations as
 * drawn, comments or tracked changes. Needs no library and also runs in the
 * background worker (see zip.ts, xml.ts).
 */
import { urlExtension } from './file-types'
import { folderOf, joinPath, openZip, type Zip } from './zip'
import {
  attr,
  find,
  findAll,
  first,
  kids,
  local,
  parseXml,
  textOf,
  type XNode,
} from './xml'

/* ---------------- the model both readers produce ---------------- */

export interface TextRun {
  text: string
  b?: true
  i?: true
  u?: true
  s?: true
  sup?: true
  sub?: true
  /** a web address (http, https, mailto) */
  href?: string
}
export type Run =
  | TextRun
  | { br: true }
  /** a picture: an index into OfficeDoc.images */
  | { img: number }
  /** a footnote mark: its number */
  | { note: number }

export interface Para {
  t: 'p'
  runs: Run[]
  /** 1-6 for a heading */
  head?: number
  align?: 'center' | 'right'
  list?: { ordered: boolean; depth: number }
}
export interface Cell {
  span?: number
  blocks: Block[]
}
export interface Table {
  t: 'table'
  rows: Cell[][]
}
export type Block = Para | Table

export interface Slide {
  title: Run[]
  blocks: Block[]
  notes: Block[]
  hidden?: true
}

export interface OfficeDoc {
  kind: 'docx' | 'pptx'
  /** a Word document's body */
  blocks: Block[]
  /** a Word document's footnotes, numbered from 1 */
  notes: Block[][]
  slides: Slide[]
  /** pictures as data: URLs; '' for one not shown (a format browsers cannot
   *  draw, or past the size limit) */
  images: string[]
}

/* ---------------- shared parts ---------------- */

interface Rel {
  type: string
  /** a zip path, or the address of an external target */
  target: string
  external: boolean
}

async function relsOf(zip: Zip, part: string): Promise<Map<string, Rel>> {
  const folder = folderOf(part)
  const xml = await zip.text(`${folder}_rels/${part.slice(folder.length)}.rels`)
  const out = new Map<string, Rel>()
  if (!xml) return out
  for (const r of findAll(parseXml(xml), 'Relationship')) {
    const target = r.attrs.Target || ''
    const external = r.attrs.TargetMode === 'External'
    out.set(r.attrs.Id, {
      type: r.attrs.Type || '',
      target: external ? target : joinPath(folder, target),
      external,
    })
  }
  return out
}

/** the main part named in the package's root relationships */
async function mainPart(zip: Zip, fallback: string): Promise<string> {
  for (const rel of (await relsOf(zip, '')).values()) {
    if (/\/officeDocument$/.test(rel.type)) return rel.target
  }
  return fallback
}

/** a link the reader may show: web and mail addresses only */
const safeHref = (url: string | undefined) =>
  url && /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : undefined

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}
/** pictures shown in all, in bytes (the rest show as "[picture]") */
const MAX_PICTURES = 20 * 1024 * 1024

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

/** the pictures of a file, each read once */
function pictures(zip: Zip) {
  const images: string[] = []
  const seen = new Map<string, number>()
  let total = 0
  return {
    images,
    async add(path: string): Promise<number> {
      if (seen.has(path)) return seen.get(path)
      const n = images.length
      seen.set(path, n)
      images.push('')
      const mime = MIME[urlExtension(path)]
      const bytes = mime ? await zip.bytes(path) : null
      if (bytes && total + bytes.length <= MAX_PICTURES) {
        total += bytes.length
        images[n] = `data:${mime};base64,${base64(bytes)}`
      }
      return n
    },
  }
}

const on = (node: XNode | null, off = ['0', 'false', 'none']) =>
  !!node && !off.includes(attr(node, 'val') ?? '')

/** add a run, joining it to the one before when they look the same */
function pushRun(runs: Run[], run: Run) {
  const last = runs[runs.length - 1]
  if (
    last &&
    'text' in last &&
    'text' in run &&
    JSON.stringify({ ...last, text: '' }) ===
      JSON.stringify({ ...run, text: '' })
  ) {
    last.text += run.text
  } else runs.push(run)
}

const hasContent = (runs: Run[]) =>
  runs.some(r => !('text' in r) || r.text.trim() !== '')

/* ---------------- Word ---------------- */

async function readDocx(zip: Zip): Promise<OfficeDoc> {
  const main = await mainPart(zip, 'word/document.xml')
  const xml = await zip.text(main)
  if (!xml) throw new Error('no document in this file')
  const folder = folderOf(main)
  const rels = await relsOf(zip, main)
  const partOf = (type: string, name: string) => {
    for (const r of rels.values())
      if (!r.external && r.type.endsWith(`/${type}`)) return r.target
    return folder + name
  }
  const pics = pictures(zip)

  // headings and list styles come from styles.xml
  const styles = parseXml(
    (await zip.text(partOf('styles', 'styles.xml'))) || '',
  )
  const styleNodes = new Map<string, XNode>()
  for (const s of findAll(styles, 'style')) {
    if (attr(s, 'type') === 'paragraph') styleNodes.set(attr(s, 'styleId'), s)
  }
  const headingOf = (id: string, depth = 0): number | undefined => {
    const s = styleNodes.get(id)
    if (!s || depth > 8) return undefined
    const name = (attr(first(s, 'name'), 'val') || '').toLowerCase()
    const m = /^heading\s*([1-6])$/.exec(name)
    if (m) return +m[1]
    if (name === 'title') return 1
    const lvl = attr(find(first(s, 'pPr'), 'outlineLvl'), 'val')
    if (lvl !== undefined && +lvl < 6) return +lvl + 1
    const base = attr(first(s, 'basedOn'), 'val')
    return base ? headingOf(base, depth + 1) : undefined
  }
  const styleNumbering = (id: string, depth = 0): XNode | null => {
    const s = styleNodes.get(id)
    if (!s || depth > 8) return null
    const numPr = find(first(s, 'pPr'), 'numPr')
    if (numPr) return numPr
    const base = attr(first(s, 'basedOn'), 'val')
    return base ? styleNumbering(base, depth + 1) : null
  }

  // bullets or numbers, per list and level, from numbering.xml
  const numbering = parseXml(
    (await zip.text(partOf('numbering', 'numbering.xml'))) || '',
  )
  const abstract = new Map<string, Map<number, string>>()
  for (const a of findAll(numbering, 'abstractNum')) {
    const levels = new Map<number, string>()
    for (const l of kids(a, 'lvl')) {
      levels.set(+(attr(l, 'ilvl') || 0), attr(first(l, 'numFmt'), 'val') || '')
    }
    abstract.set(attr(a, 'abstractNumId'), levels)
  }
  const lists = new Map<string, Map<number, string>>()
  for (const n of findAll(numbering, 'num')) {
    const levels = abstract.get(attr(first(n, 'abstractNumId'), 'val'))
    if (levels) lists.set(attr(n, 'numId'), levels)
  }

  // footnotes, numbered in the order the text refers to them
  const footXml = await zip.text(partOf('footnotes', 'footnotes.xml'))
  const footnotes = new Map<string, XNode>()
  if (footXml) {
    for (const f of findAll(parseXml(footXml), 'footnote')) {
      if (!attr(f, 'type')) footnotes.set(attr(f, 'id'), f)
    }
  }
  const notes: Block[][] = []
  const noteNumbers = new Map<string, number>()

  async function runOf(r: XNode, href: string | undefined, out: Run[]) {
    const rPr = first(r, 'rPr')
    const fmt: Omit<TextRun, 'text'> = {}
    if (on(first(rPr, 'b'))) fmt.b = true
    if (on(first(rPr, 'i'))) fmt.i = true
    if (on(first(rPr, 'u'))) fmt.u = true
    if (on(first(rPr, 'strike')) || on(first(rPr, 'dstrike'))) fmt.s = true
    const va = attr(first(rPr, 'vertAlign'), 'val')
    if (va === 'superscript') fmt.sup = true
    if (va === 'subscript') fmt.sub = true
    if (href) fmt.href = href
    for (const k of kids(r)) {
      const n = local(k.name)
      if (n === 't') pushRun(out, { text: textOf(k), ...fmt })
      else if (n === 'tab' || n === 'ptab') pushRun(out, { text: '\t', ...fmt })
      else if (n === 'noBreakHyphen') pushRun(out, { text: '-', ...fmt })
      else if (n === 'br' || n === 'cr') out.push({ br: true })
      else if (n === 'drawing' || n === 'pict' || n === 'object') {
        const blip = find(k, 'blip')
        const id =
          (blip && (blip.attrs['r:embed'] ?? attr(blip, 'embed'))) ||
          attr(find(k, 'imagedata'), 'r:id')
        const rel = id ? rels.get(id) : undefined
        if (rel && !rel.external) out.push({ img: await pics.add(rel.target) })
      } else if (n === 'footnoteReference') {
        const id = attr(k, 'id')
        const note = footnotes.get(id)
        if (!note) continue
        if (!noteNumbers.has(id)) {
          // numbered now; its text is read after (it may refer to others)
          const at = notes.length
          noteNumbers.set(id, at + 1)
          notes.push([])
          notes[at] = await blocksOf(note)
        }
        out.push({ note: noteNumbers.get(id) })
      }
    }
  }

  /** the runs of a paragraph (or of a link, field, inserted text... in it) */
  async function inline(node: XNode, href: string | undefined, out: Run[]) {
    for (const k of kids(node)) {
      const n = local(k.name)
      if (n === 'r') await runOf(k, href, out)
      else if (n === 'hyperlink') {
        const id = k.attrs['r:id']
        const rel = id ? rels.get(id) : undefined
        await inline(k, safeHref(rel?.external ? rel.target : undefined), out)
      } else if (n === 'sdt')
        await inline(first(k, 'sdtContent') || k, href, out)
      else if (
        n === 'fldSimple' ||
        n === 'ins' ||
        n === 'moveTo' ||
        n === 'smartTag' ||
        n === 'customXml'
      )
        await inline(k, href, out)
      else if (n === 'oMath' || n === 'oMathPara') {
        const math = findAll(k, 't')
          .map(t => textOf(t))
          .join('')
        if (math) pushRun(out, { text: math, i: true })
      }
    }
  }

  async function para(p: XNode): Promise<Para> {
    const pPr = first(p, 'pPr')
    const style = attr(first(pPr, 'pStyle'), 'val') || ''
    const out: Para = { t: 'p', runs: [] }
    const lvl = attr(first(pPr, 'outlineLvl'), 'val')
    const head = lvl !== undefined && +lvl < 6 ? +lvl + 1 : headingOf(style)
    if (head) out.head = head
    const jc = attr(first(pPr, 'jc'), 'val')
    if (jc === 'center') out.align = 'center'
    else if (jc === 'right' || jc === 'end') out.align = 'right'
    const numPr = first(pPr, 'numPr') || styleNumbering(style)
    const numId = attr(first(numPr, 'numId'), 'val')
    if (numPr && numId && numId !== '0' && !head) {
      const depth = Math.min(8, +(attr(first(numPr, 'ilvl'), 'val') || 0))
      const fmt = lists.get(numId)?.get(depth) ?? 'bullet'
      if (fmt !== 'none') {
        out.list = { ordered: fmt !== 'bullet', depth }
      }
    }
    await inline(p, undefined, out.runs)
    return out
  }

  async function table(tbl: XNode): Promise<Table> {
    const rows: Cell[][] = []
    for (const tr of kids(tbl, 'tr')) {
      const row: Cell[] = []
      for (const tc of kids(tr, 'tc')) {
        const tcPr = first(tc, 'tcPr')
        const span = +(attr(first(tcPr, 'gridSpan'), 'val') || 1)
        const vMerge = first(tcPr, 'vMerge')
        // a cell merged with the one above: left empty
        const merged = vMerge && attr(vMerge, 'val') !== 'restart'
        row.push({
          ...(span > 1 ? { span } : {}),
          blocks: merged ? [] : await blocksOf(tc),
        })
      }
      rows.push(row)
    }
    return { t: 'table', rows }
  }

  async function blocksOf(node: XNode): Promise<Block[]> {
    const out: Block[] = []
    for (const k of kids(node)) {
      const n = local(k.name)
      if (n === 'p') out.push(await para(k))
      else if (n === 'tbl') out.push(await table(k))
      else if (n === 'sdt')
        out.push(...(await blocksOf(first(k, 'sdtContent') || k)))
      else if (n === 'customXml' || n === 'ins')
        out.push(...(await blocksOf(k)))
    }
    return out
  }

  const body = find(parseXml(xml), 'body')
  const blocks = body ? await blocksOf(body) : []
  // drop empty paragraphs at the end (Word keeps one or more there)
  while (blocks.length) {
    const last = blocks[blocks.length - 1]
    if (last.t === 'p' && !hasContent(last.runs)) blocks.pop()
    else break
  }
  return { kind: 'docx', blocks, notes, slides: [], images: pics.images }
}

/* ---------------- PowerPoint ---------------- */

async function readPptx(zip: Zip): Promise<OfficeDoc> {
  const main = await mainPart(zip, 'ppt/presentation.xml')
  const xml = await zip.text(main)
  if (!xml) throw new Error('no presentation in this file')
  const rels = await relsOf(zip, main)
  const pics = pictures(zip)
  const slides: Slide[] = []

  for (const id of findAll(find(parseXml(xml), 'sldIdLst'), 'sldId')) {
    const rel = rels.get(id.attrs['r:id'] ?? attr(id, 'id'))
    if (!rel || rel.external) continue
    const slideXml = await zip.text(rel.target)
    if (!slideXml) continue
    const root = parseXml(slideXml)
    const srels = await relsOf(zip, rel.target)
    const slide: Slide = { title: [], blocks: [], notes: [] }
    if (attr(find(root, 'sld'), 'show') === '0') slide.hidden = true

    const runsOf = (p: XNode): Run[] => {
      const out: Run[] = []
      for (const k of kids(p)) {
        const n = local(k.name)
        if (n === 'br') out.push({ br: true })
        else if (n === 'r' || n === 'fld') {
          const rPr = first(k, 'rPr')
          const fmt: Omit<TextRun, 'text'> = {}
          if (rPr?.attrs.b === '1' || rPr?.attrs.b === 'true') fmt.b = true
          if (rPr?.attrs.i === '1' || rPr?.attrs.i === 'true') fmt.i = true
          if (rPr?.attrs.u && rPr.attrs.u !== 'none') fmt.u = true
          if (rPr?.attrs.strike && rPr.attrs.strike !== 'noStrike') fmt.s = true
          const base = +(rPr?.attrs.baseline || 0)
          if (base > 0) fmt.sup = true
          if (base < 0) fmt.sub = true
          const link = find(rPr, 'hlinkClick')
          const lrel = link ? srels.get(link.attrs['r:id']) : undefined
          const href = safeHref(lrel?.external ? lrel.target : undefined)
          if (href) fmt.href = href
          pushRun(out, { text: textOf(first(k, 't')), ...fmt })
        }
      }
      return out
    }

    /** the paragraphs of a text body; `bullets`: listed unless told not to */
    const textBlocks = (txBody: XNode | null, bullets: boolean): Para[] => {
      const out: Para[] = []
      for (const p of kids(txBody, 'p')) {
        const runs = runsOf(p)
        if (!hasContent(runs)) continue
        const pPr = first(p, 'pPr')
        const depth = Math.min(8, +(attr(pPr, 'lvl') || 0))
        const numbered = !!first(pPr, 'buAutoNum')
        const listed =
          !first(pPr, 'buNone') &&
          (bullets || numbered || !!first(pPr, 'buChar'))
        out.push({
          t: 'p',
          runs,
          ...(listed ? { list: { ordered: numbered, depth } } : {}),
        })
      }
      return out
    }

    const tableOf = (tbl: XNode): Table => ({
      t: 'table',
      rows: kids(tbl, 'tr').map(tr =>
        kids(tr, 'tc')
          .filter(tc => tc.attrs.hMerge !== '1')
          .map(tc => {
            const span = +(tc.attrs.gridSpan || 1)
            return {
              ...(span > 1 ? { span } : {}),
              blocks:
                tc.attrs.vMerge === '1'
                  ? []
                  : textBlocks(first(tc, 'txBody'), false),
            }
          }),
      ),
    })

    const walk = async (tree: XNode | null) => {
      for (const k of kids(tree)) {
        const n = local(k.name)
        if (n === 'sp') {
          const ph = find(first(k, 'nvSpPr'), 'ph')
          const type = ph ? attr(ph, 'type') || 'body' : ''
          const txBody = first(k, 'txBody')
          if (type === 'title' || type === 'ctrTitle') {
            for (const p of kids(txBody, 'p')) {
              if (slide.title.length) slide.title.push({ br: true })
              slide.title.push(...runsOf(p))
            }
          } else if (!['dt', 'ftr', 'sldNum', 'hdr'].includes(type)) {
            slide.blocks.push(
              ...textBlocks(txBody, type === 'body' || type === 'obj'),
            )
          }
        } else if (n === 'graphicFrame') {
          const tbl = find(k, 'tbl')
          if (tbl) slide.blocks.push(tableOf(tbl))
        } else if (n === 'pic') {
          const blip = find(k, 'blip')
          const prel = blip ? srels.get(blip.attrs['r:embed']) : undefined
          if (prel && !prel.external) {
            slide.blocks.push({
              t: 'p',
              runs: [{ img: await pics.add(prel.target) }],
            })
          }
        } else if (n === 'grpSp') await walk(k)
        else if (n === 'AlternateContent') await walk(first(k, 'Choice'))
      }
    }
    await walk(find(root, 'spTree'))

    // speaker notes: the notes page's body text
    for (const r of srels.values()) {
      if (r.external || !r.type.endsWith('/notesSlide')) continue
      const notesXml = await zip.text(r.target)
      if (!notesXml) continue
      for (const sp of findAll(find(parseXml(notesXml), 'spTree'), 'sp')) {
        const ph = find(first(sp, 'nvSpPr'), 'ph')
        if (ph && attr(ph, 'type') === 'body') {
          slide.notes.push(...textBlocks(first(sp, 'txBody'), false))
        }
      }
    }
    slides.push(slide)
  }
  return { kind: 'pptx', blocks: [], notes: [], slides, images: pics.images }
}

/* ---------------- either ---------------- */

/** a Word or PowerPoint file, by its name */
export async function readOffice(
  bytes: ArrayBuffer | Uint8Array,
  name: string,
): Promise<OfficeDoc> {
  const zip = openZip(bytes)
  return urlExtension(name) === 'pptx' ? readPptx(zip) : readDocx(zip)
}
