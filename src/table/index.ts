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
  decodeText,
  isTableName,
  isWorkbookName,
  tableSource,
} from '@/core/table'
import { renderSheets, renderTable } from '@/core/table-view'
import { readXlsx } from '@/core/xlsx'
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
  nameEl.textContent = name || 'AnyRead MD'
  nameEl.title = decodeSafe(src)
  document.title = name || 'AnyRead MD'

  let url: URL
  try {
    url = new URL(src)
  } catch {
    url = null
  }
  if (!url || !/^(file|https?):$/.test(url.protocol) || !isTableName(src)) {
    content.textContent = t('preview_error')
    return
  }

  content.textContent = t('preview_loading')
  let bytes: ArrayBuffer
  try {
    const res = await fetch(url.href)
    if (!res.ok && res.status !== 0) throw new Error(String(res.status))
    bytes = await res.arrayBuffer()
  } catch {
    content.textContent = t('preview_error')
    return
  }

  const labels = {
    size: t('table_size'),
    truncated: t('table_truncated'),
    empty: t('table_empty'),
  }
  if (isWorkbookName(src)) {
    try {
      renderSheets(content, await readXlsx(bytes), labels, 10000)
    } catch {
      content.textContent = t('table_unreadable')
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
