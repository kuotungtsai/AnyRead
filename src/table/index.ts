/**
 * The table page: shows a CSV / TSV file that Chrome would otherwise only
 * download, with a button to download it as it is.
 *
 *   table.html?src=file:///C:/data/sales.csv
 */
import './style.less'
import storage from '@/core/storage'
import i18n from '@/config/i18n'
import { fileName } from '@/core/file-types'
import {
  PAGE_MAX_BYTES,
  TOO_LARGE,
  decodeText,
  isTableName,
  isWorkbookName,
  readLimited,
  tableSource,
} from '@/core/table'
import { renderSheets, renderTable } from '@/core/table-view'
import { readXlsx } from '@/core/xlsx'
import { readOffice } from '@/core/office'
import { officeLabels, renderOffice } from '@/core/office-view'
import { isOfficeName, isPageName } from '@/core/file-types'
import { inFolderFrame } from '@/core/files'
import { toTheme } from '@/shared'

const $ = (id: string) => document.getElementById(id)

async function main() {
  const data: any = await storage.get().catch(() => ({}))
  const t = i18n(data?.language)
  document.documentElement.dataset.theme = toTheme(data?.pageTheme || 'light')
  document.documentElement.lang = t.locale

  const src = tableSource(location.href)
  const name = fileName(src)
  const nameEl = $('name')
  const content = $('content')
  const download = $('download') as HTMLButtonElement
  download.textContent = t('table_download')
  download.title = t('table_download_tip')
  nameEl.textContent = name || 'AnyRead'
  nameEl.title = decodeSafe(src)
  document.title = name || 'AnyRead'
  // on the right of the folder page: its tree marks this file, and Close
  // (or Esc, here or in the tree) goes back to the folder's file list
  if (inFolderFrame()) {
    window.parent.postMessage(
      { type: 'anyread:shown', url: src.split('#')[0] },
      '*',
    )
    const close = $('close') as HTMLButtonElement
    const toList = () =>
      window.parent.postMessage({ type: 'anyread:close' }, '*')
    close.textContent = `${t('editor_close')} (Esc)`
    close.hidden = false
    close.addEventListener('click', toList)
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') toList()
    })
    window.addEventListener('message', e => {
      if (e.source === window.parent && e.data?.type === 'anyread:esc') toList()
    })
  }

  let url: URL
  try {
    url = new URL(src)
  } catch {
    url = null
  }
  if (!url || !/^(file|https?):$/.test(url.protocol) || !isPageName(src)) {
    content.textContent = t('preview_error')
    return
  }

  content.textContent = t('preview_loading')
  let bytes: Uint8Array
  try {
    const res = await fetch(url.href)
    if (!res.ok && res.status !== 0) throw new Error(String(res.status))
    bytes = await readLimited(res, PAGE_MAX_BYTES)
  } catch {
    content.textContent = t('preview_error')
    return
  }
  if (!bytes) {
    content.textContent = t('table_too_large')
    return
  }

  const labels = {
    size: t('table_size'),
    truncated: t('table_truncated'),
    empty: t('table_empty'),
  }
  if (isOfficeName(src)) {
    document.body.classList.add('office')
    try {
      renderOffice(content, await readOffice(bytes, src), officeLabels(t))
    } catch (e) {
      content.textContent = t(
        (e as Error)?.message === TOO_LARGE
          ? 'table_too_large'
          : 'office_unreadable',
      )
      return
    }
  } else if (isWorkbookName(src)) {
    try {
      renderSheets(content, await readXlsx(bytes), labels, 10000)
    } catch (e) {
      content.textContent = t(
        (e as Error)?.message === TOO_LARGE
          ? 'table_too_large'
          : 'table_unreadable',
      )
      return
    }
  } else {
    const text = decodeText(bytes, chrome.i18n.getUILanguage())
    renderTable(content, text, src, labels, 10000)
  }

  // the file exactly as it is on disk (same bytes, same encoding)
  download.disabled = false
  download.addEventListener('click', () => {
    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  })
}

function decodeSafe(s: string) {
  try {
    return decodeURI(s)
  } catch {
    return s
  }
}

main()
