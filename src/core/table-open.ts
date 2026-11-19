import { safeCall } from './runtime'
import { tablePageUrl } from './table'
import { inFolderFrame } from './files'

/**
 * Chrome downloads a CSV file instead of showing it, so a CSV file opens on
 * the extension's table page (in this tab or a new one) through the
 * background worker.
 */
export function openTablePage(url: string, newTab: boolean) {
  // inside the folder page's frame: the table replaces the frame's file
  if (!newTab && inFolderFrame()) {
    location.href = tablePageUrl(chrome.runtime.getURL(''), url)
    return
  }
  safeCall(() =>
    chrome.runtime.sendMessage(
      { action: 'openTable', data: { url, newTab } },
      () => void chrome.runtime.lastError,
    ),
  )
}
