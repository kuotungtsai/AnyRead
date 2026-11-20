import Ele from './ele'
import className from '@/config/class-name'
import type { DirEntry } from '@/dir-frame'
import { isOfficeName, isPageName, parentFolder } from './file-types'
import { openTablePage } from './table-open'

export const MD_EXT_RE = /\.(md|mdx|mkd|markdown)$/i

/**
 * Name of the frame on the right of AnyRead MD's folder page. A frame keeps
 * its name while it moves from file to file, so a page can tell it is shown
 * there, and not inside some other page's frame (where AnyRead MD stays out).
 */
export const FOLDER_FRAME = 'anyread-folder'
export const inFolderFrame = () =>
  window.top !== window && window.name === FOLDER_FRAME

/**
 * List a file:// directory by loading Chrome's directory listing page in a
 * hidden iframe. The `dir-frame` content script posts the entries back.
 */
export function listDir(dirUrl: string, timeout = 8000): Promise<DirEntry[]> {
  return new Promise((resolve, reject) => {
    const nonce = Math.random().toString(36).slice(2)
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.display = 'none'
    frame.src = `${dirUrl}#mdr-dir=${nonce}`

    const onMessage = (e: MessageEvent) => {
      const data = e.data
      if (!data || data.type !== 'md-reader:dir' || data.nonce !== nonce) return
      if (e.source !== frame.contentWindow) return
      cleanup()
      resolve(Array.isArray(data.entries) ? data.entries : [])
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Directory listing timed out'))
    }, timeout)
    function cleanup() {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      frame.remove()
    }

    window.addEventListener('message', onMessage)
    document.body.appendChild(frame)
  })
}

const stripUrl = (url: string) => url.split('#')[0].split('?')[0]
const dirOf = (url: string) => stripUrl(url).replace(/[^/]*$/, '')
const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
const dirName = (dir: string) =>
  decode(dir.replace(/\/$/, '').split('/').pop() || dir)

function sortEntries(
  entries: DirEntry[],
  isViewable: (name: string) => boolean,
): DirEntry[] {
  return entries
    .filter(e => e.isDir || isViewable(e.name))
    .filter(e => !e.name.startsWith('.'))
    .sort((a, b) =>
      a.isDir !== b.isDir
        ? a.isDir
          ? -1
          : 1
        : a.name.localeCompare(b.name, undefined, { numeric: true }),
    )
}

export function isFileProtocol(): boolean {
  return location.protocol === 'file:'
}

/**
 * Folder tree panel for the side bar. Root starts at the current file's
 * directory; folders expand lazily.
 */
export function createFileTree(
  labels: {
    up: string
    empty: string
    error: string
    /** "Open here" for the ▸ in front of a folder */
    expand: string
  },
  /** files listed in the tree: markdown by default */
  isViewable: (name: string) => boolean = name => MD_EXT_RE.test(name),
) {
  const currentFile = stripUrl(location.href)
  let rootDir = dirOf(currentFile)

  const panel = new Ele<HTMLElement>('div', { className: className.FILES })
  const header = new Ele<HTMLElement>('div', {
    className: className.FILES_HEADER,
  })
  const list = new Ele<HTMLElement>('ul', { className: className.FILES_LIST })
  panel.append([header, list])

  function renderHeader() {
    header.innerHTML = null
    const up = new Ele<HTMLElement>('button', {
      className: className.FILES_UP,
      title: labels.up,
    })
    up.textContent = '↑'
    // greyed out at the top of a drive, a share or / (nothing is listed above)
    const parent = parentFolder(rootDir)
    if (!parent) up.ele.setAttribute('disabled', '')
    up.on('click', () => {
      if (!parent) return
      rootDir = parent
      load()
    })
    // the folder's name opens its folder page (Ctrl+click: a new tab)
    const title = new Ele<HTMLElement>('a', {
      className: className.FILES_TITLE,
      title: decode(rootDir),
      href: rootDir,
    })
    title.textContent = dirName(rootDir)
    header.append([up, title])
  }

  function renderEntries(
    target: Ele<HTMLElement>,
    entries: DirEntry[],
    depth: number,
  ) {
    const items = sortEntries(entries, isViewable)
    if (!items.length) {
      const li = new Ele<HTMLElement>('li', {
        className: className.FILES_EMPTY,
      })
      li.textContent = labels.empty
      li.style.paddingLeft = `${1.2 + depth * 0.9}em`
      target.append(li)
      return
    }
    items.forEach(entry => target.append(renderItem(entry, depth)))
  }

  function renderItem(entry: DirEntry, depth: number): Ele<HTMLElement> {
    const li = new Ele<HTMLElement>('li', {
      className: entry.isDir ? className.FILES_DIR : className.FILES_FILE,
    })
    const link = new Ele<HTMLElement>('a', {
      href: entry.url,
      title: entry.name,
    })
    link.style.paddingLeft = `${1.2 + depth * 0.9}em`
    const icon = new Ele<HTMLElement>('span', {
      className: className.FILES_ICON,
    })
    icon.textContent = entry.isDir ? '▸' : '•'
    const text = new Ele<HTMLElement>('span')
    text.textContent = entry.name
    link.append([icon, text])
    li.append(link)

    if (!entry.isDir) {
      if (stripUrl(entry.url) === currentFile) {
        li.classList.add(className.FILES_ACTIVE)
      }
      // a table, Word or PowerPoint file: Chrome would only download it
      if (isPageName(entry.url)) {
        icon.textContent = isOfficeName(entry.url) ? '▤' : '▦'
        link.on('click', (e: MouseEvent) => {
          if (e.shiftKey || e.altKey) return
          e.preventDefault()
          openTablePage(entry.url, e.ctrlKey || e.metaKey)
        })
        link.on('auxclick', (e: MouseEvent) => {
          if (e.button !== 1) return
          e.preventDefault()
          openTablePage(entry.url, true)
        })
      }
      return li
    }

    // a folder: its name is a link to its folder page (the browser opens it,
    // in this tab or, with Ctrl or the middle button, a new one); ▸ opens it
    // here in the tree
    icon.ele.setAttribute('title', labels.expand)
    let children: Ele<HTMLElement> = null
    let expanded = false
    link.on('click', async (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(`.${className.FILES_ICON}`)) return
      e.preventDefault()
      expanded = !expanded
      icon.textContent = expanded ? '▾' : '▸'
      if (!expanded) {
        children?.hide()
        return
      }
      if (children) {
        children.show()
        return
      }
      children = new Ele<HTMLElement>('ul')
      li.append(children)
      try {
        renderEntries(children, await listDir(entry.url), depth + 1)
      } catch {
        const err = new Ele<HTMLElement>('li', {
          className: className.FILES_EMPTY,
        })
        err.textContent = labels.error
        children.append(err)
      }
    })
    return li
  }

  async function load() {
    renderHeader()
    list.innerHTML = null
    try {
      renderEntries(list, await listDir(rootDir), 0)
    } catch {
      const err = new Ele<HTMLElement>('li', {
        className: className.FILES_EMPTY,
      })
      err.textContent = labels.error
      list.append(err)
    }
  }

  let loaded = false
  return {
    panel,
    /** load lazily on first show */
    ensureLoaded() {
      if (!loaded) {
        loaded = true
        load()
      }
    },
    reload: load,
  }
}
