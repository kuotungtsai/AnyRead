/**
 * Runs on Chrome's built-in file:// directory listing page.
 *
 * - Inside a hidden iframe created by md-reader (marked `#mdr-dir=<nonce>`):
 *   reads the listing and posts the entries back to the parent viewer page.
 * - As the top-level page: replaces the plain listing with AnyRead MD's
 *   folder page: two columns. The main one lists a folder (filter, search
 *   inside files) or shows a file you pick, in a frame so the folder page
 *   stays; the left one lists the folder above it, as a tree.
 *
 * Nothing is sent anywhere else.
 */
import './style/dir-frame.less'
import storage from '@/core/storage'
import i18n from '@/config/i18n'
import {
  isMarkdownName,
  isOfficeName,
  isPageName,
  isTableName,
  viewableMatcher,
} from '@/core/file-types'
import { openTablePage } from '@/core/table-open'
import { tablePageUrl } from '@/core/table'
import { FOLDER_FRAME, listDir } from '@/core/files'
import { findMatches, type Match } from '@/core/search'

export interface DirEntry {
  name: string
  url: string
  isDir: boolean
  size?: string
  date?: string
  /** modified time in seconds, when Chrome's listing gives it */
  time?: number
}

const MARK = 'mdr-dir='

function collectEntries(): DirEntry[] {
  const rows = Array.from(document.querySelectorAll('#tbody tr'))
  return rows
    .map(tr => {
      const a = tr.querySelector<HTMLAnchorElement>('a.icon')
      const cells = tr.querySelectorAll('td')
      return a
        ? {
            name: (a.textContent || '').replace(/\/$/, '').trim(),
            url: a.href,
            isDir: a.classList.contains('dir'),
            size: cells[1]?.textContent?.trim() || '',
            date: cells[2]?.textContent?.trim() || '',
            time: Number(cells[2]?.dataset.value) || 0,
          }
        : null
    })
    .filter(e => e && e.name && e.name !== '..')
}

function whenListed(fn: () => void) {
  if (document.querySelector('#tbody')) fn()
  else window.addEventListener('load', fn, { once: true })
}

/* ---------- hidden iframe mode ---------- */
function frameMode() {
  const nonce = location.hash.slice(1 + MARK.length)
  whenListed(() =>
    window.parent.postMessage(
      { type: 'md-reader:dir', nonce, entries: collectEntries() },
      '*',
    ),
  )
}

/* ---------- top-level folder view ---------- */
const STYLE = `
:root{--bg:#fff;--fg:#2d3d50;--sub:#909090;--line:#eaebee;--hover:#f3f6ff;--primary:#607cd2;--side:#f9fafb}
:root[data-theme=dark]{--bg:#1d1f23;--fg:#d5d9e0;--sub:#8b919c;--line:#2c2f36;--hover:#262a33;--primary:#7b97ec;--side:#23262c}
body.mdr-dir{margin:0;overflow:hidden;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Microsoft JhengHei',sans-serif}
body.mdr-dir > :not(.mdr-app){display:none !important}
.mdr-app{display:grid;grid-template-columns:280px minmax(0,1fr);height:100vh}
.mdr-side{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--line);background:var(--side)}
.mdr-side-head{display:flex;align-items:flex-start;gap:6px;padding:14px 8px 8px 16px}
.mdr-side-head b{flex:1;min-width:0}
.mdr-side-btn{flex:none;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:none;color:var(--sub);font-size:16px;line-height:26px;cursor:pointer}
.mdr-side-btn:hover{background:var(--hover);color:var(--primary)}
.mdr-strip{display:none;flex-direction:column;align-items:center;padding-top:12px;border-right:1px solid var(--line);background:var(--side)}
.mdr-app.side-off{grid-template-columns:34px minmax(0,1fr)}
.mdr-app.side-off .mdr-side{display:none}
.mdr-app.side-off .mdr-strip{display:flex}
.mdr-side-head b{display:block;font-size:15px;word-break:break-all}
.mdr-tree{flex:1;overflow:auto;padding:0 0 16px;font-size:14px}
.mdr-tree ul{list-style:none;margin:0;padding:0}
.mdr-tree a{display:flex;align-items:center;gap:6px;padding:4px 16px;color:inherit;text-decoration:none;white-space:nowrap}
.mdr-tree a span:last-child{overflow:hidden;text-overflow:ellipsis}
.mdr-tree a:hover{background:var(--hover)}
.mdr-tree a.on{background:var(--hover);color:var(--primary);font-weight:600}
.mdr-tree .mdr-other{opacity:.6}
.mdr-tree-icon{flex:none;width:1.2em;text-align:center;color:var(--sub)}
.mdr-main{display:flex;flex-direction:column;min-width:0;min-height:0}
.mdr-frame{flex:1;width:100%;border:0;background:var(--bg)}
.mdr-scroll{flex:1;overflow:auto}
.mdr-view{max-width:960px;margin:0 auto;padding:28px 32px 60px}
@media (max-width:700px){.mdr-app{grid-template-columns:180px minmax(0,1fr)}}
.mdr-crumbs{font-size:14px;color:var(--sub);word-break:break-all}
.mdr-crumbs a{color:var(--sub);text-decoration:none}.mdr-crumbs a:hover{color:var(--primary)}
.mdr-view h1{margin:6px 0 18px;font-size:24px}
.mdr-bar{display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.mdr-bar input[type=search]{flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--side);color:var(--fg);font-size:14px;outline:none}
.mdr-bar input[type=search]:focus{border-color:var(--primary)}
.mdr-bar label{font-size:13px;color:var(--sub);user-select:none;cursor:pointer}
.mdr-list{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.mdr-list li a{display:flex;align-items:center;gap:10px;padding:9px 14px;color:inherit;text-decoration:none;border-top:1px solid var(--line)}
.mdr-list li:first-child a{border-top:none}
.mdr-list li a:hover,.mdr-list li a.sel{background:var(--hover)}
.mdr-icon{width:1.4em;text-align:center;flex:none}
.mdr-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mdr-md .mdr-name{font-weight:600;color:var(--primary)}
.mdr-code .mdr-name{color:var(--primary)}
.mdr-other{opacity:.6}
.mdr-meta{flex:none;font-size:12px;color:var(--sub);white-space:nowrap}
.mdr-meta.size{width:80px;text-align:right}.mdr-meta.date{width:170px;text-align:right}
.mdr-empty{padding:16px;color:var(--sub);font-size:14px}
.mdr-hint{margin-top:10px;font-size:12px;color:var(--sub)}
.mdr-pick{padding:48px 32px;color:var(--sub);font-size:14px;text-align:center}
.mdr-tree .mdr-folder .mdr-tree-icon{cursor:pointer;border-radius:4px}
.mdr-tree .mdr-folder .mdr-tree-icon:hover{background:var(--line);color:var(--fg)}
.mdr-results{margin-top:14px}
.mdr-results h2{margin:0 0 8px;font-size:14px;color:var(--sub);font-weight:600}
.mdr-hit{display:block;padding:8px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;color:inherit;text-decoration:none}
.mdr-hit:hover{background:var(--hover)}
.mdr-hit b{color:var(--primary);font-size:13px}
.mdr-hit span{display:block;margin-top:2px;font-size:13px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mdr-hit mark{background:#ffe58a;color:#2d3d50;border-radius:2px}
@media (max-width:640px){.mdr-meta.date{display:none}}
`

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const k in attrs) e.setAttribute(k, attrs[k])
  if (text !== undefined) e.textContent = text
  return e
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** lift the style that hides Chrome's own listing while the folder page loads */
function showPage() {
  document.documentElement.classList.add('anyread-ready')
}

async function topMode() {
  const data: any = await storage.get()
  if (data?.enable === false || data?.dirView === false) return showPage()
  const t = i18n(data?.language)
  // Chrome writes the dates in the browser's language: use AnyRead MD's
  let dateFormat: Intl.DateTimeFormat = null
  try {
    dateFormat = new Intl.DateTimeFormat(t.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {}
  const showDate = (e: DirEntry) =>
    e.time && dateFormat ? dateFormat.format(e.time * 1000) : e.date || ''
  // light or dark like the reader's pages ("auto" follows the system), kept
  // in step when the setting or the system changes, as the file on the right is
  let pageTheme: string = data?.pageTheme || 'light'
  const dark = matchMedia('(prefers-color-scheme: dark)')
  const applyTheme = () => {
    document.documentElement.dataset.theme =
      pageTheme === 'auto' ? (dark.matches ? 'dark' : 'light') : pageTheme
  }
  applyTheme()
  dark.addEventListener('change', applyTheme)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.pageTheme) return
    pageTheme = changes.pageTheme.newValue || 'light'
    applyTheme()
  })
  // markdown + the extra code types from the options page
  const isViewable = viewableMatcher(data?.codeExts)
  const kind = (e: DirEntry) =>
    e.isDir ? 0 : isMarkdownName(e.name) ? 1 : isViewable(e.name) ? 2 : 3
  /** files the right side shows: ours, plus pictures and PDFs Chrome shows */
  const showable = (name: string) =>
    isViewable(name) || /\.(png|jpe?g|gif|webp|svg|bmp|avif|pdf)$/i.test(name)
  /** what the frame loads for a file: CSV / Excel go to the table page */
  const frameSrc = (url: string) =>
    isPageName(url) ? tablePageUrl(chrome.runtime.getURL(''), url) : url

  whenListed(() => {
    const here = location.href.split('#')[0]
    let showAll = data?.dirShowAll === true
    let selected = 0

    const style = el('style')
    style.textContent = STYLE
    document.head.appendChild(style)
    document.head.appendChild(
      el('link', {
        rel: 'icon',
        type: 'image/svg+xml',
        href: chrome.runtime.getURL('images/icon.svg'),
      }),
    )
    document.body.classList.add('mdr-dir')

    /* ----- folders: this page's own listing, others read in hidden frames ----- */
    const pathParts = (url: string) =>
      new URL(url).pathname.split('/').filter(Boolean)
    const dirName = (url: string) => {
      const p = pathParts(url)
      return decode(p[p.length - 1] || '/')
    }
    /** the folder above, or null at the top of a drive */
    const parentOf = (url: string) =>
      pathParts(url).length > 1 ? new URL('../', url).href : null
    const same = (a: string, b: string) =>
      !!a && !!b && decode(a.split('#')[0]) === decode(b.split('#')[0])
    const listings = new Map<string, Promise<DirEntry[]>>([
      [here, Promise.resolve(collectEntries())],
    ])
    function readDir(url: string): Promise<DirEntry[]> {
      if (!listings.has(url)) {
        const p = listDir(url)
        p.catch(() => listings.delete(url)) // try again next time
        listings.set(url, p)
      }
      return listings.get(url)
    }

    // What the page shows: the folder listed in the main column (cur; ''
    // = none yet, at the top of a drive), the folder on the left (always the
    // one above cur, unless a folder was picked on the left), and a file
    // shown in the main column instead of cur's list. Kept in the page's
    // history entry, so Back and Forward step through it.
    interface View {
      dir: string
      left: string
      shown: string
    }
    let cur = ''
    let curEntries: DirEntry[] = []
    let leftDir = ''
    let shown = ''
    /** a folder opened afresh: listed in the main column, its parent on the left */
    const viewFor = (dir: string): View => {
      const up = parentOf(dir)
      return up
        ? { dir, left: up, shown: '' }
        : { dir: '', left: dir, shown: '' }
    }

    /* ----- main column: a folder's list ----- */
    const view = el('div', { class: 'mdr-view' })
    const crumbs = el('div', { class: 'mdr-crumbs' })
    const title = el('h1')

    const bar = el('div', { class: 'mdr-bar' })
    const filter = el('input', {
      type: 'search',
      placeholder: t('dir_filter'),
    })
    const allLabel = el('label')
    const allBox = el('input', { type: 'checkbox' })
    allBox.checked = showAll
    allLabel.append(allBox, ' ' + t('dir_show_all'))
    bar.append(filter, allLabel)

    const inText = el('label')
    const inTextBox = el('input', { type: 'checkbox' })
    inText.append(inTextBox, ' ' + t('dir_search_text'))
    bar.append(inText)
    const results = el('div', { class: 'mdr-results' })

    /* ----- search inside the Markdown files of the listed folder ----- */
    const MAX_FILES = 300
    const MAX_DEPTH = 3
    let files: Promise<DirEntry[]> = null
    const texts = new Map<string, Promise<string | null>>()
    let searchRun = 0

    /** Markdown files in cur and its sub-folders (a few levels, capped) */
    function allFiles(): Promise<DirEntry[]> {
      if (files) return files
      const start = curEntries
      files = (async () => {
        const found: DirEntry[] = []
        const walk = async (items: DirEntry[], depth: number) => {
          for (const e of items) {
            if (found.length >= MAX_FILES) return
            if (e.name.startsWith('.')) continue
            if (!e.isDir) {
              if (isMarkdownName(e.name)) found.push(e)
            } else if (depth < MAX_DEPTH && e.name !== 'node_modules') {
              try {
                await walk(await readDir(e.url), depth + 1)
              } catch {
                // unreadable folder: skip it
              }
            }
          }
        }
        await walk(start, 0)
        return found
      })()
      return files
    }

    function readText(url: string): Promise<string | null> {
      if (!texts.has(url)) {
        texts.set(
          url,
          new Promise(resolve =>
            chrome.runtime.sendMessage(
              { action: 'readFile', data: { url } },
              res => {
                void chrome.runtime.lastError
                resolve(res?.ok ? res.text ?? '' : null)
              },
            ),
          ),
        )
      }
      return texts.get(url)
    }

    const relPath = (url: string) => decode(url.slice(cur.length))

    function hitRow(e: DirEntry, m: Match, q: string) {
      const a = el('a', {
        class: 'mdr-hit',
        href: e.url,
        title: relPath(e.url),
      })
      a.append(el('b', {}, `${relPath(e.url)} : ${m.line}`))
      const line = el('span')
      const i = m.text.toLowerCase().indexOf(q.toLowerCase())
      if (i < 0) line.textContent = m.text
      else {
        line.append(
          m.text.slice(0, i),
          el('mark', {}, m.text.slice(i, i + q.length)),
          m.text.slice(i + q.length),
        )
      }
      a.append(line)
      return a
    }

    async function searchText() {
      const run = ++searchRun
      const q = filter.value.trim()
      results.textContent = ''
      if (!inTextBox.checked || q.length < 2 || !cur) return
      const head = el('h2', {}, t('dir_searching'))
      results.append(head)
      const list = await allFiles()
      let total = 0
      for (const e of list) {
        if (run !== searchRun) return
        const text = await readText(e.url)
        if (run !== searchRun) return
        if (!text) continue
        for (const m of findMatches(text, q, 3)) {
          if (total >= 200) break
          total++
          results.append(hitRow(e, m, q))
        }
      }
      head.textContent = total
        ? `${t('dir_search_found')}: ${total}`
        : t('dir_search_none')
    }
    let searchTimer: number = null
    const queueSearch = () => {
      clearTimeout(searchTimer)
      searchTimer = window.setTimeout(searchText, 250)
    }
    inTextBox.addEventListener('change', queueSearch)

    const list = el('ul', { class: 'mdr-list' })
    const hint = el('div', { class: 'mdr-hint' }, t('dir_hint'))

    function visible(): DirEntry[] {
      const q = filter.value.trim().toLowerCase()
      const items = curEntries.filter(
        e => (showAll || kind(e) < 3) && !e.name.startsWith('.'),
      )
      return items
        .filter(e => !q || e.name.toLowerCase().includes(q))
        .sort((a, b) => {
          return (
            kind(a) - kind(b) ||
            a.name.localeCompare(b.name, undefined, { numeric: true })
          )
        })
    }

    function render() {
      list.textContent = ''
      const items = visible()
      if (!items.length) {
        list.append(el('li', { class: 'mdr-empty' }, t('files_empty')))
      }
      items.forEach(e => {
        const k = kind(e)
        const li = el('li', {
          class: ['mdr-dir-item', 'mdr-md', 'mdr-code', 'mdr-other'][k],
        })
        const a = el('a', { href: e.url, title: e.name })
        const table = !e.isDir && isTableName(e.name)
        const office = !e.isDir && isOfficeName(e.name)
        a.append(
          el(
            'span',
            { class: 'mdr-icon' },
            table ? '📊' : office ? '📑' : ['📁', '📝', '📃', '📄'][k],
          ),
          el('span', { class: 'mdr-name' }, e.name),
          el('span', { class: 'mdr-meta size' }, e.isDir ? '' : e.size || ''),
          el('span', { class: 'mdr-meta date' }, showDate(e)),
        )
        li.append(a)
        list.append(li)
      })
      selected = Math.max(
        0,
        Math.min(selected, list.querySelectorAll('a').length - 1),
      )
      highlight()
    }

    function highlight() {
      list.querySelectorAll('a').forEach((a, i) => {
        a.classList.toggle('sel', i === selected)
        if (i === selected) a.scrollIntoView({ block: 'nearest' })
      })
    }

    // breadcrumb: file:///C:/a/b/  ->  C: / a / b (each opens that folder here)
    function renderHead() {
      crumbs.textContent = ''
      const parts = pathParts(cur)
      parts.forEach((part, i) => {
        const href = new URL('/' + parts.slice(0, i + 1).join('/') + '/', cur)
          .href
        if (i) crumbs.append(' / ')
        crumbs.append(el('a', { href }, decode(part)))
      })
      title.textContent = dirName(cur)
    }

    /** list a folder in the main column */
    let dirRun = 0
    async function showDir(dir: string) {
      const run = ++dirRun
      cur = dir
      curEntries = []
      files = null
      searchRun++
      results.textContent = ''
      filter.value = ''
      selected = 0
      view.hidden = !dir
      pick.hidden = !!dir
      if (!dir) return
      renderHead()
      list.textContent = ''
      list.append(el('li', { class: 'mdr-empty' }, t('preview_loading')))
      let items: DirEntry[]
      try {
        items = await readDir(dir)
      } catch {
        items = null
      }
      if (run !== dirRun) return
      if (!items) {
        list.textContent = ''
        list.append(el('li', { class: 'mdr-empty' }, t('files_error')))
        return
      }
      curEntries = items
      render()
      queueSearch()
    }

    filter.addEventListener('input', () => {
      selected = 0
      render()
      queueSearch()
    })
    allBox.addEventListener('change', () => {
      showAll = allBox.checked
      storage.set('dirShowAll', showAll)
      render()
    })
    // keyboard: ↑/↓ to move, Enter to open, typing goes to the filter
    document.addEventListener('keydown', e => {
      if (scroll.hidden) {
        // a file is shown: the keys belong to it. Esc pressed with the tree
        // focused goes to it too (it closes its pane, or the file)
        if (e.key === 'Escape') {
          frame.contentWindow?.postMessage({ type: 'anyread:esc' }, '*')
        }
        return
      }
      if (view.hidden) return
      const links = list.querySelectorAll('a')
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = links.length
        if (!n) return
        selected = (selected + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
        highlight()
      } else if (e.key === 'Enter' && links[selected]) {
        e.preventDefault()
        const href = (links[selected] as HTMLAnchorElement).href
        if (href.endsWith('/')) go({ dir: href, left: cur, shown: '' })
        else if (openEntry(href, e)) return
        else if (isPageName(href)) openTablePage(href, e.ctrlKey || e.metaKey)
        else location.href = href
      } else if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        document.activeElement !== filter
      ) {
        filter.focus()
      }
    })

    view.append(crumbs, title, bar, list, hint, results)
    const pick = el('div', { class: 'mdr-pick' }, t('dir_pick'))

    /* ----- main column: a file in a frame, or a folder's list ----- */
    const main = el('section', { class: 'mdr-main' })
    const frame = el('iframe', {
      class: 'mdr-frame',
      title: '',
      name: FOLDER_FRAME,
    })
    const scroll = el('div', { class: 'mdr-scroll' })
    scroll.append(view, pick)
    main.append(frame, scroll)

    // Our own moves replace the frame's document (no history entry of its
    // own); links followed inside the frame add theirs.
    let frameUsed = false
    // the file last loaded into the frame, until the frame says it shows it
    let wanted = ''
    let retried = false
    const loadFrame = (url: string) => {
      wanted = url
      retried = false
      const src = frameSrc(url)
      if (!frameUsed) {
        frameUsed = true
        frame.src = src // the first load replaces the empty frame
      } else frame.contentWindow.location.replace(src)
    }
    const current = (): View => ({ dir: cur, left: leftDir, shown })
    const remember = (push: boolean) => {
      const state = { ...history.state, anyreadView: current() }
      if (push) history.pushState(state, '')
      else history.replaceState(state, '')
    }

    /** show a view; push = a step of its own in the browser's history */
    function go(next: View, push = true) {
      const now = current()
      if (
        push &&
        now.dir === next.dir &&
        now.left === next.left &&
        now.shown === next.shown
      ) {
        if (!next.shown && !view.hidden) filter.focus()
        return
      }
      if (next.left !== leftDir) showLeft(next.left)
      if (next.dir !== cur) showDir(next.dir)
      view.hidden = !next.dir
      pick.hidden = !!next.dir
      if (next.shown) {
        if (next.shown !== shown || frame.hidden) loadFrame(next.shown)
        shown = next.shown
        frame.hidden = false
        scroll.hidden = true
      } else {
        shown = ''
        // drop the hidden file (a large table stays in memory otherwise)
        wanted = ''
        if (frameUsed && !frame.hidden)
          frame.contentWindow.location.replace('about:blank')
        frame.hidden = true
        scroll.hidden = false
        if (!view.hidden) filter.focus()
      }
      document.title = dirName(cur || leftDir)
      markShown()
      remember(push)
    }
    window.addEventListener('popstate', e => {
      const v = e.state?.anyreadView
      if (v && typeof v.left === 'string') go(v, false)
    })
    window.addEventListener('message', e => {
      if (e.source !== frame.contentWindow) return
      // the file's Close button (or Esc): back to the folder's list
      if (e.data?.type === 'anyread:close') {
        return go({ dir: cur, left: leftDir, shown: '' })
      }
      // a file opened inside the frame: the tree marks it
      if (e.data?.type !== 'anyread:shown') return
      const url = String(e.data.url || '')
      if (!url.startsWith('file:')) return
      if (wanted && !same(url, wanted) && !retried) {
        // a page already replaced finished loading late (Back pressed while
        // it loaded) and took the frame: load the file this entry is for
        retried = true
        frame.contentWindow.location.replace(frameSrc(wanted))
        return
      }
      wanted = ''
      shown = url
      markShown()
      remember(false)
    })

    const newTab = (ev?: MouseEvent | KeyboardEvent) =>
      !!ev && (ev.ctrlKey || ev.metaKey || ('button' in ev && ev.button === 1))
    /** open a file in the main column; false when it is not one shown there */
    function openEntry(url: string, ev?: MouseEvent | KeyboardEvent) {
      if (!showable(url)) return false
      if (newTab(ev)) {
        if (isPageName(url)) openTablePage(url, true)
        else window.open(url, '_blank', 'noopener')
        return true
      }
      go({ dir: cur, left: leftDir, shown: url })
      return true
    }
    // in the main column: a folder goes one level down (the left column
    // follows), a file opens here, a breadcrumb opens that folder
    view.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest?.(
        'a[href]',
      ) as HTMLAnchorElement
      if (!a || e.shiftKey || e.altKey) return
      if (a.closest('.mdr-crumbs')) {
        if (newTab(e)) return
        e.preventDefault()
        go(viewFor(a.href))
        return
      }
      if (!a.closest('.mdr-list, .mdr-results')) return
      if (a.href.endsWith('/')) {
        if (newTab(e)) return // a folder page of its own in a new tab
        e.preventDefault()
        go({ dir: a.href, left: cur, shown: '' })
        return
      }
      if (openEntry(a.href.split('#')[0], e)) e.preventDefault()
    })
    view.addEventListener('auxclick', e => {
      const a = (e.target as HTMLElement).closest?.(
        'a[href]',
      ) as HTMLAnchorElement
      if (!a || e.button !== 1 || a.href.endsWith('/')) return
      if (openEntry(a.href.split('#')[0], e)) e.preventDefault()
    })

    /* ----- left column: the folder above, as a tree ----- */
    const side = el('aside', { class: 'mdr-side' })
    const head = el('div', { class: 'mdr-side-head' })
    const headName = el('b')
    // hide the left column (more room for the file and its split pane)
    const hideBtn = el(
      'button',
      { class: 'mdr-side-btn', type: 'button', title: t('dir_side_hide') },
      '«',
    )
    head.append(headName, hideBtn)
    const strip = el('div', { class: 'mdr-strip' })
    const showBtn = el(
      'button',
      { class: 'mdr-side-btn', type: 'button', title: t('dir_side_show') },
      '»',
    )
    strip.append(showBtn)
    const setSide = (hidden: boolean) => {
      app.classList.toggle('side-off', hidden)
      storage.set('dirSideHidden', hidden)
    }
    hideBtn.addEventListener('click', () => setSide(true))
    showBtn.addEventListener('click', () => setSide(false))
    const tree = el('nav', { class: 'mdr-tree' })
    side.append(head, tree)

    const treeLink = (
      icon: string,
      text: string,
      href: string,
      cls = '',
    ): HTMLAnchorElement => {
      const a = el('a', { href, title: text, class: cls })
      a.append(
        el('span', { class: 'mdr-tree-icon' }, icon),
        el('span', {}, text),
      )
      return a
    }

    function treeEntries(items: DirEntry[]) {
      return items
        .filter(e => !e.name.startsWith('.') && (showAll || kind(e) < 3))
        .sort(
          (a, b) =>
            Number(b.isDir) - Number(a.isDir) ||
            a.name.localeCompare(b.name, undefined, { numeric: true }),
        )
    }
    function renderTree(target: HTMLElement, items: DirEntry[], depth: number) {
      const ul = el('ul')
      for (const e of treeEntries(items)) {
        const li = el('li')
        const icon = e.isDir
          ? '▸'
          : isTableName(e.name)
          ? '▦'
          : isOfficeName(e.name)
          ? '▤'
          : '•'
        const a = treeLink(
          icon,
          e.name,
          e.url,
          kind(e) === 3 ? 'mdr-other' : '',
        )
        a.dataset.url = e.url
        a.style.paddingLeft = `${16 + depth * 14}px`
        li.append(a)
        if (e.isDir) {
          a.classList.add('mdr-folder')
          let children: HTMLElement = null
          const toggle = async () => {
            const open = !children || children.hidden
            a.firstElementChild.textContent = open ? '▾' : '▸'
            if (children) {
              children.hidden = !open
              return
            }
            children = el('div')
            li.append(children)
            try {
              renderTree(children, await readDir(e.url), depth + 1)
            } catch {
              children.append(
                el('div', { class: 'mdr-empty' }, t('files_error')),
              )
            }
          }
          // ▸ opens the folder here in the tree; its name, in the main column
          a.addEventListener('click', ev => {
            if (ev.shiftKey || ev.altKey || newTab(ev)) return
            ev.preventDefault()
            if ((ev.target as HTMLElement).closest('.mdr-tree-icon')) toggle()
            else go({ dir: e.url, left: leftDir, shown: '' })
          })
        } else {
          a.addEventListener('click', ev => {
            if (ev.shiftKey || ev.altKey) return
            if (openEntry(e.url, ev)) ev.preventDefault()
          })
          a.addEventListener('auxclick', ev => {
            if (ev.button === 1 && openEntry(e.url, ev)) ev.preventDefault()
          })
        }
        ul.append(li)
      }
      target.append(ul)
      markShown()
    }

    /** list a folder on the left, with "up one level" above it */
    let leftRun = 0
    async function showLeft(dir: string) {
      const run = ++leftRun
      leftDir = dir
      headName.textContent = dirName(dir)
      headName.title = decode(dir)
      tree.textContent = ''
      const up = parentOf(dir)
      if (up) {
        const upItem = treeLink('↰', t('dir_up'), up)
        upItem.addEventListener('click', ev => {
          if (newTab(ev)) return
          ev.preventDefault()
          go(viewFor(leftDir))
        })
        tree.append(upItem)
      }
      const wait = el('div', { class: 'mdr-empty' }, t('preview_loading'))
      tree.append(wait)
      let items: DirEntry[]
      try {
        items = await readDir(dir)
      } catch {
        items = null
      }
      if (run !== leftRun) return
      wait.remove()
      if (!items) {
        tree.append(el('div', { class: 'mdr-empty' }, t('files_error')))
        return
      }
      renderTree(tree, items, 0)
    }
    function markShown() {
      tree.querySelectorAll<HTMLAnchorElement>('a[data-url]').forEach(a => {
        const u = a.dataset.url
        a.classList.toggle('on', same(u, shown) || same(u, cur))
      })
    }
    allBox.addEventListener('change', () => {
      const d = leftDir
      leftDir = ''
      showLeft(d)
    })

    const app = el('div', { class: 'mdr-app' })
    app.classList.toggle('side-off', data?.dirSideHidden === true)
    app.append(strip, side, main)
    document.body.append(app)
    showPage()

    // the folder opened: listed in the main column, the one above on the
    // left (at the top of a drive: the drive on the left, nothing picked yet)
    go(viewFor(here), false)
  })
}

if (window.top !== window) {
  if (location.hash.slice(1).startsWith(MARK)) frameMode()
  else showPage() // a listing framed by some other page: left as Chrome shows it
} else {
  topMode().catch(err => {
    showPage()
    throw err
  })
}
