/**
 * Draw a Word or PowerPoint file read by office.ts: a document's headings,
 * paragraphs, lists, tables and footnotes, or a presentation slide by slide
 * with its speaker notes. Used by the table page and by the pane next to a
 * document. Text is set as text, never as HTML; links only to web and mail
 * addresses; pictures only from the file itself (data: URLs).
 */
import type { Block, OfficeDoc, Para, Run } from './office'

export interface OfficeLabels {
  /** "Slide {n}" */
  slide: string
  /** "Speaker notes" */
  notes: string
  /** "Footnotes" */
  footnotes: string
  /** shown for a picture in a format the browser cannot draw */
  picture: string
  /** "Hidden" (a slide hidden in the show) */
  hidden: string
  /** a file with no text */
  empty: string
}

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

function runs(
  target: HTMLElement,
  list: Run[],
  doc: OfficeDoc,
  labels: OfficeLabels,
) {
  for (const r of list) {
    if ('br' in r) target.append(el('br'))
    else if ('img' in r) {
      const src = doc.images[r.img]
      if (src && src.startsWith('data:image/')) {
        const img = el('img')
        img.src = src
        img.alt = ''
        target.append(img)
      } else target.append(el('span', 'anyread-office-pic', labels.picture))
    } else if ('note' in r) {
      target.append(el('sup', 'anyread-office-ref', String(r.note)))
    } else {
      let node: HTMLElement | Text = document.createTextNode(r.text)
      const wrap = (tag: keyof HTMLElementTagNameMap) => {
        const w = el(tag)
        w.append(node)
        node = w
      }
      if (r.b) wrap('strong')
      if (r.i) wrap('em')
      if (r.u) wrap('u')
      if (r.s) wrap('s')
      if (r.sup) wrap('sup')
      if (r.sub) wrap('sub')
      if (r.href && /^(https?:|mailto:)/i.test(r.href)) {
        const a = el('a')
        a.href = r.href
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.append(node)
        node = a
      }
      target.append(node)
    }
  }
}

function para(p: Para, doc: OfficeDoc, labels: OfficeLabels): HTMLElement {
  const e = p.head ? el(`h${Math.min(6, p.head)}` as 'h1') : el('p')
  if (p.align) e.style.textAlign = p.align
  runs(e, p.runs, doc, labels)
  return e
}

/** blocks in order; list paragraphs gathered into (nested) lists */
function blocks(
  target: HTMLElement,
  list: Block[],
  doc: OfficeDoc,
  labels: OfficeLabels,
) {
  // open lists, outermost first
  let open: { el: HTMLElement; depth: number; ordered: boolean }[] = []
  for (const b of list) {
    if (b.t === 'p' && b.list) {
      const { depth, ordered } = b.list
      while (open.length && open[open.length - 1].depth > depth) open.pop()
      let top = open[open.length - 1]
      if (top && top.depth === depth && top.ordered !== ordered) {
        open.pop()
        top = open[open.length - 1]
      }
      if (!top || top.depth < depth) {
        const l = el(ordered ? 'ol' : 'ul')
        const parent = top ? top.el.lastElementChild || top.el : target
        parent.append(l)
        open.push({ el: l, depth, ordered })
        top = open[open.length - 1]
      }
      const li = el('li')
      if (b.align) li.style.textAlign = b.align
      runs(li, b.runs, doc, labels)
      top.el.append(li)
      continue
    }
    open = []
    if (b.t === 'p') target.append(para(b, doc, labels))
    else {
      const wrap = el('div', 'anyread-office-table')
      const table = el('table')
      for (const row of b.rows) {
        const tr = el('tr')
        for (const c of row) {
          const td = el('td')
          if (c.span) td.colSpan = c.span
          blocks(td, c.blocks, doc, labels)
          tr.append(td)
        }
        table.append(tr)
      }
      wrap.append(table)
      target.append(wrap)
    }
  }
}

const fill = (text: string, n: number) => text.replace('{n}', String(n))

/** the labels, in the interface language */
export const officeLabels = (t: (key: string) => string): OfficeLabels => ({
  slide: t('office_slide'),
  notes: t('office_notes'),
  footnotes: t('office_footnotes'),
  picture: t('office_picture'),
  hidden: t('office_hidden'),
  empty: t('office_empty'),
})

/** replace the contents of `target` with the file */
export function renderOffice(
  target: HTMLElement,
  doc: OfficeDoc,
  labels: OfficeLabels,
) {
  target.textContent = ''
  const root = el('div', `anyread-office anyread-office--${doc.kind}`)
  if (doc.kind === 'docx') {
    blocks(root, doc.blocks, doc, labels)
    if (doc.notes.length) {
      const sec = el('section', 'anyread-office-notes')
      sec.append(el('h2', '', labels.footnotes))
      const ol = el('ol')
      for (const note of doc.notes) {
        const li = el('li')
        blocks(li, note, doc, labels)
        ol.append(li)
      }
      sec.append(ol)
      root.append(sec)
    }
    if (!doc.blocks.length)
      root.append(el('p', 'anyread-office-empty', labels.empty))
  } else {
    doc.slides.forEach((slide, i) => {
      const sec = el('section', 'anyread-slide')
      if (slide.hidden) sec.classList.add('anyread-slide--hidden')
      const head = el('div', 'anyread-slide-no', fill(labels.slide, i + 1))
      if (slide.hidden)
        head.append(el('span', 'anyread-slide-tag', labels.hidden))
      sec.append(head)
      if (slide.title.length) {
        const h = el('h2', 'anyread-slide-title')
        runs(h, slide.title, doc, labels)
        sec.append(h)
      }
      blocks(sec, slide.blocks, doc, labels)
      if (slide.notes.length) {
        const aside = el('aside', 'anyread-slide-notes')
        aside.append(el('div', 'anyread-slide-notes-label', labels.notes))
        blocks(aside, slide.notes, doc, labels)
        sec.append(aside)
      }
      root.append(sec)
    })
    if (!doc.slides.length)
      root.append(el('p', 'anyread-office-empty', labels.empty))
  }
  target.append(root)
}
