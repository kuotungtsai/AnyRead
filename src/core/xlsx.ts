/**
 * A small reader for Excel workbooks (.xlsx): the values of every sheet, as
 * text, the way Excel shows them closely enough for reading. No formatting,
 * charts or pictures. Uses the browser's own unzip (DecompressionStream), so
 * it needs no library and also runs in the background worker and in Node.
 *
 * An .xlsx file is a zip of XML files:
 *   xl/workbook.xml            sheet names and order
 *   xl/_rels/workbook.xml.rels which file holds which sheet
 *   xl/sharedStrings.xml       the text of text cells
 *   xl/styles.xml              number formats (dates, percentages)
 *   xl/worksheets/sheetN.xml   the cells
 */

export interface Sheet {
  name: string
  rows: string[][]
}

/* ---------------- zip ---------------- */

interface ZipEntry {
  method: number
  size: number
  offset: number
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u32 = (b: Uint8Array, i: number) =>
  (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0

function zipEntries(b: Uint8Array): Map<string, ZipEntry> {
  // end of central directory: the last 22 bytes, plus a comment of up to 64 KB
  let end = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('not a zip file')
  const count = u16(b, end + 10)
  let p = u32(b, end + 16)
  const names = new TextDecoder()
  const entries = new Map<string, ZipEntry>()
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('broken zip directory')
    const method = u16(b, p + 10)
    const size = u32(b, p + 20)
    const nameLen = u16(b, p + 28)
    const extraLen = u16(b, p + 30)
    const commentLen = u16(b, p + 32)
    const local = u32(b, p + 42)
    const name = names.decode(b.subarray(p + 46, p + 46 + nameLen))
    // the data starts after the local header, whose extra field may differ
    const offset = local + 30 + u16(b, local + 26) + u16(b, local + 28)
    entries.set(name.replace(/\\/g, '/'), { method, size, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readEntry(
  b: Uint8Array,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string | null> {
  const e = entries.get(name)
  if (!e) return null
  const raw = b.subarray(e.offset, e.offset + e.size)
  let data: Uint8Array
  if (e.method === 0) data = raw
  else if (e.method === 8) data = await inflate(raw)
  else throw new Error('unsupported zip compression')
  return new TextDecoder().decode(data)
}

/* ---------------- XML (only what Excel writes) ---------------- */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code =
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)
        return Number.isFinite(code) ? String.fromCodePoint(code) : m
      }
      return ENTITIES[e] ?? m
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = unescapeXml(m[3] ?? m[4])
  }
  return out
}

/** the text of every <t> inside (rich text has one per run); phonetic runs skipped */
function textOf(xml: string): string {
  const plain = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let s = ''
  for (const m of plain.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) {
    s += unescapeXml(m[1] ?? '')
  }
  return s
}

/* ---------------- numbers and dates ---------------- */

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 27, 30, 36, 50, 57])
const TIME_FORMAT_IDS = new Set([18, 19, 20, 21, 45, 46, 47])
const PERCENT_FORMAT_IDS = new Set([9, 10])

type Kind = 'date' | 'time' | 'datetime' | 'percent' | 'number'

/** what a custom number format shows: a date, a time, a percentage... */
export function formatKind(code: string): Kind {
  // drop quoted text, [colors]/[$-locale], escaped and padding characters
  const c = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\.|_.|\*./g, '')
    .toLowerCase()
  // "m" is minutes right after an hour or before seconds, otherwise a month
  const cm = c.replace(/am\/pm|a\/p/g, '')
  const month = [...cm.matchAll(/m+/g)].some(m => {
    const before = cm
      .slice(0, m.index)
      .replace(/[^a-z:]/g, '')
      .slice(-1)
    const after = cm.slice(m.index + m[0].length).replace(/[^a-z:]/g, '')[0]
    return before !== 'h' && before !== ':' && after !== ':' && after !== 's'
  })
  const date = /[dy]/.test(c) || month
  const time = /h|s|am\/pm|a\/p/.test(c)
  if (date && time) return 'datetime'
  if (date) return 'date'
  if (time) return 'time'
  if (c.includes('%')) return 'percent'
  return 'number'
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Excel's day number (1900 system) → "2026-11-18", "2026-11-18 09:30" ... */
export function excelDate(
  serial: number,
  kind: Kind,
  date1904 = false,
): string {
  // Excel counts a 29 February 1900 that never was: days before it are one off
  const day1900 = !date1904 && serial < 60 ? serial + 1 : serial
  const ms = Math.round((day1900 + (date1904 ? 1462 : 0) - 25569) * 86400000)
  const d = new Date(ms)
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}`
  let time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  if (d.getUTCSeconds()) time += `:${pad(d.getUTCSeconds())}`
  if (kind === 'date') return day
  if (kind === 'time') return time
  return `${day} ${time}`
}

/** a stored number as Excel shows it in a general cell (15 significant digits) */
export function excelNumber(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return String(parseFloat(n.toPrecision(15)))
}

/* ---------------- cells ---------------- */

/** "C12" → 2 (zero-based column) */
export function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + code - 64
  }
  return n - 1
}

function parseStyles(xml: string | null): Kind[] {
  if (!xml) return []
  const custom = new Map<number, Kind>()
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
    const a = attrs(m[0])
    custom.set(+a.numFmtId, formatKind(a.formatCode || ''))
  }
  const xfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || ''
  return [...xfs.matchAll(/<xf\b[^>]*>/g)].map(m => {
    const id = +attrs(m[0]).numFmtId || 0
    if (custom.has(id)) return custom.get(id)
    if (DATE_FORMAT_IDS.has(id)) return 'date'
    if (TIME_FORMAT_IDS.has(id)) return 'time'
    if (id === 22) return 'datetime'
    if (PERCENT_FORMAT_IDS.has(id)) return 'percent'
    return 'number'
  })
}

function cellText(
  a: Record<string, string>,
  inner: string,
  shared: string[],
  styles: Kind[],
  date1904: boolean,
): string {
  const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
  switch (a.t) {
    case 's':
      return shared[+v] ?? ''
    case 'inlineStr':
      return textOf(inner)
    case 'str':
    case 'e':
      return unescapeXml(v ?? '')
    case 'b':
      return v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : ''
  }
  if (v === undefined) return ''
  const kind = styles[+a.s || 0] || 'number'
  const n = Number(v)
  if (!Number.isFinite(n)) return unescapeXml(v)
  if (kind === 'date' || kind === 'time' || kind === 'datetime')
    return excelDate(n, kind, date1904)
  if (kind === 'percent') return `${excelNumber(String(n * 100))}%`
  return excelNumber(v)
}

function parseSheet(
  xml: string,
  shared: string[],
  styles: Kind[],
  date1904: boolean,
): string[][] {
  const rows: string[][] = []
  const data = xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1] || ''
  let next = 0
  for (const rm of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attrs(rm[1]).r
    const at = r ? +r - 1 : next
    next = at + 1
    const row: string[] = []
    let col = 0
    for (const cm of (rm[2] || '').matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const a = attrs(cm[1])
      if (a.r) col = columnIndex(a.r)
      const text = cellText(a, cm[2] || '', shared, styles, date1904)
      if (text !== '') {
        while (row.length < col) row.push('')
        row[col] = text
      }
      col++
    }
    rows[at] = row
  }
  // rows Excel left out (empty ones) and empty rows at the end
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = []
  while (rows.length && !rows[rows.length - 1].length) rows.pop()
  return rows
}

/** the folder of a zip path: "xl/workbook.xml" → "xl/" */
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/** resolve a relationship target against its folder ("../a", "/xl/a") */
function joinPath(folder: string, target: string): string {
  const parts = (
    target.startsWith('/') ? target.slice(1) : folder + target
  ).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

/** every sheet of an .xlsx file, values as text */
export async function readXlsx(
  bytes: ArrayBuffer | Uint8Array,
): Promise<Sheet[]> {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const entries = zipEntries(b)
  const read = (name: string) => readEntry(b, entries, name)

  // the workbook is usually xl/workbook.xml; the package root says for sure
  const rootRels = (await read('_rels/.rels')) || ''
  let book = 'xl/workbook.xml'
  for (const m of rootRels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0])
    if (/officeDocument$/.test(a.Type || '')) book = joinPath('', a.Target)
  }
  const workbook = await read(book)
  if (!workbook) throw new Error('no workbook in this file')
  const folder = folderOf(book)
  const date1904 = /<workbookPr\b[^>]*date1904\s*=\s*"(1|true)"/.test(workbook)

  const rels =
    (await read(`${folder}_rels/${book.slice(folder.length)}.rels`)) || ''
  const targets = new Map<string, string>()
  let sharedPath = `${folder}sharedStrings.xml`
  let stylesPath = `${folder}styles.xml`
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0])
    const path = joinPath(folder, a.Target || '')
    targets.set(a.Id, path)
    if (/sharedStrings$/.test(a.Type || '')) sharedPath = path
    if (/styles$/.test(a.Type || '')) stylesPath = path
  }

  const sharedXml = (await read(sharedPath)) || ''
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(
    m => textOf(m[1]),
  )
  const styles = parseStyles(await read(stylesPath))

  const sheets: Sheet[] = []
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0])
    const id =
      a['r:id'] ?? Object.entries(a).find(([k]) => k.endsWith(':id'))?.[1]
    const path = targets.get(id)
    if (!path || a.state === 'veryHidden') continue
    const xml = await read(path)
    if (xml === null) continue // a chart sheet or a missing part
    sheets.push({
      name: a.name || `Sheet${sheets.length + 1}`,
      rows: parseSheet(xml, shared, styles, date1904),
    })
  }
  return sheets
}
