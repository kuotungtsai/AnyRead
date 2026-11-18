import { safeCall } from './runtime'

/**
 * Chrome downloads a CSV file instead of showing it, so a CSV file opens on
 * the extension's table page (in this tab or a new one) through the
 * background worker.
 */
export function openTablePage(url: string, newTab: boolean) {
  safeCall(() =>
    chrome.runtime.sendMessage(
      { action: 'openTable', data: { url, newTab } },
      () => void chrome.runtime.lastError,
    ),
  )
}
