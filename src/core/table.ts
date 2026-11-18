/**
 * Table files (CSV / TSV). Chrome downloads these instead of showing them,
 * so AnyRead MD shows them itself: in the pane next to a document, or on its
 * own table page. Pure helpers only (no DOM, no chrome.*), easy to test.
 */
export {
  TABLE_EXTS,
  WORKBOOK_EXTS,
  isTableName,
  isWorkbookName,
} from './file-types'

/** the extension's own page that shows a table file */
export const TABLE_PAGE = 'table.html'

/** address of the table page for a file (`base` is the extension's root URL) */
export const tablePageUrl = (base: string, file: string) =>
  `${base}${TABLE_PAGE}?src=${encodeURIComponent(file.split('#')[0])}`

/** the file a table page address points to ('' when none) */
export function tableSource(pageUrl: string): string {
  try {
    return new URL(pageUrl).searchParams.get('src') || ''
  } catch {
    return ''
  }
}

const DELIMITERS = [',', ';', '\t', '|']

/**
 * The delimiter of a delimited text: tab for .tsv, otherwise whichever of
 * , ; tab | appears most in the first line (outside quotes). Excel in many
 * European languages writes ";" instead of ",".
 */
export function guessDelimiter(text: string, ext = 'csv'): string {
  if (ext === 'tsv') return '\t'
  const counts = new Map(DELIMITERS.map(d => [d, 0]))
  let quoted = false
  for (const ch of text.slice(0, 10000)) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch) + 1)
  }
  let best = ','
  for (const d of DELIMITERS) if (counts.get(d) > counts.get(best)) best = d
  return best
}

export interface ParsedTable {
  rows: string[][]
  /** the widest row, in cells */
  columns: number
  /** true when there were more rows than `maxRows` */
  truncated: boolean
}

/**
 * Parse CSV the way spreadsheets write it (RFC 4180): fields in double quotes
 * may hold the delimiter, line breaks and "" for a quote. A missing closing
 * quote takes the rest of the file, like Excel does.
 */
export function parseDelimited(
  text: string,
  delimiter = ',',
  maxRows = Infinity,
): ParsedTable {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0 // byte order mark
  const n = text.length
  let truncated = false

  const endRow = () => {
    row.push(field)
    field = ''
    rows.push(row)
    row = []
  }

  while (i < n) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
      } else {
        field += ch
      }
      i++
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRow()
      if (rows.length >= maxRows) {
        truncated = i + 1 < n
        break
      }
    } else {
      field += ch
    }
    i++
  }
  // the last line, unless the file ends with a line break
  if (!truncated && (field !== '' || row.length || quoted)) endRow()

  const columns = rows.reduce((max, r) => Math.max(max, r.length), 0)
  return { rows, columns, truncated }
}

/**
 * The legacy encoding spreadsheet programs use for CSV in the user's
 * language, tried when a file is not valid UTF-8 (Excel's "CSV" is often
 * Big5 in Taiwan, Shift_JIS in Japan...).
 */
export function legacyEncoding(language = ''): string {
  const lang = language.toLowerCase()
  if (lang === 'zh-tw' || lang === 'zh-hk' || lang === 'zh-hant') return 'big5'
  if (lang.startsWith('zh')) return 'gbk'
  if (lang.startsWith('ja')) return 'shift_jis'
  if (lang.startsWith('ko')) return 'euc-kr'
  return 'windows-1252'
}

/** bytes → text: UTF-8 when valid, otherwise the user's legacy encoding */
export function decodeText(bytes: ArrayBuffer | Uint8Array, language = '') {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder(legacyEncoding(language)).decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes)
    }
  }
}
