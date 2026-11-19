/**
 * Draw a spreadsheet as an HTML table: a CSV / TSV text, or the sheets of an
 * Excel workbook (with a tab per sheet). Used by the table page and by the
 * pane next to a document. Cells are set as text, never as HTML.
 */
import { urlExtension } from './file-types'
import { guessDelimiter, parseDelimited } from './table'

export interface TableLabels {
  /** "Rows: {rows} · Columns: {cols}" */
  size: string
  /** "Showing the first {rows} rows" */
  truncated: string
  empty: string
}

/** a sheet as handed over: `total` counts rows that were cut before sending */
export interface SheetData {
  name: string
  rows: string[][]
  total?: number
}

const fill = (text: string, values: Record<string, number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''))

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
) => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** numbers line up on the right, as in a spreadsheet */
const NUMERIC = /^\s*[-+]?[\d,]*\.?\d+(e[-+]?\d+)?\s*%?\s*$/i

/**
 * Replace the contents of `target` with a summary line and the table.
 * The first row is the header. `maxRows` keeps very large files responsive.
 */
function renderRows(
  target: HTMLElement,
  rows: string[][],
  labels: TableLabels,
  maxRows: number,
  totalRows = rows.length,
) {
  const [head = [], ...rest] = rows
  const all = Math.max(totalRows - 1, rest.length)
  const body = rest.slice(0, maxRows)
  const columns = rows.reduce((max, r) => Math.max(max, r.length), 0)

  const info = el('p', 'anyread-table-info')
  info.textContent = fill(labels.size, { rows: all, cols: columns })
  if (all > body.length) {
    info.append(
      ' · ',
      el('strong', '', fill(labels.truncated, { rows: body.length })),
    )
  }
  target.append(info)

  if (!rows.length) {
    target.append(el('p', 'anyread-table-empty', labels.empty))
    return
  }

  const wrap = el('div', 'anyread-table-wrap')
  const table = el('table', 'anyread-table')
  const thead = el('thead')
  const headRow = el('tr')
  headRow.append(el('th', 'anyread-table-num', ''))
  for (let c = 0; c < columns; c++) headRow.append(el('th', '', head[c] ?? ''))
  thead.append(headRow)

  const tbody = el('tbody')
  body.forEach((cells, r) => {
    const tr = el('tr')
    tr.append(el('td', 'anyread-table-num', String(r + 1)))
    for (let c = 0; c < columns; c++) {
      const value = cells[c] ?? ''
      tr.append(
        el('td', NUMERIC.test(value) ? 'anyread-table-number' : '', value),
      )
    }
    tbody.append(tr)
  })
  table.append(thead, tbody)
  wrap.append(table)
  target.append(wrap)
}

/** a CSV / TSV text (the delimiter is guessed) */
export function renderTable(
  target: HTMLElement,
  text: string,
  file: string,
  labels: TableLabels,
  maxRows = 5000,
) {
  const parsed = parseDelimited(text, guessDelimiter(text, urlExtension(file)))
  target.textContent = ''
  renderRows(target, parsed.rows, labels, maxRows)
}

/** the sheets of a workbook, with a tab for each when there is more than one */
export function renderSheets(
  target: HTMLElement,
  sheets: SheetData[],
  labels: TableLabels,
  maxRows = 5000,
) {
  target.textContent = ''
  if (!sheets.length) {
    target.append(el('p', 'anyread-table-empty', labels.empty))
    return
  }
  const view = el('div', 'anyread-sheet')
  const show = (i: number) => {
    tabs?.querySelectorAll('button').forEach((b, j) => {
      b.classList.toggle('active', i === j)
      b.setAttribute('aria-selected', String(i === j))
    })
    view.textContent = ''
    renderRows(view, sheets[i].rows, labels, maxRows, sheets[i].total)
  }
  let tabs: HTMLElement = null
  if (sheets.length > 1) {
    tabs = el('div', 'anyread-sheet-tabs')
    tabs.setAttribute('role', 'tablist')
    sheets.forEach((s, i) => {
      const b = el('button', '', s.name)
      b.type = 'button'
      b.setAttribute('role', 'tab')
      b.addEventListener('click', () => show(i))
      tabs.append(b)
    })
    target.append(tabs)
  }
  target.append(view)
  show(0)
}
