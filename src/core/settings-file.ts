/**
 * Settings file: save the reader's settings to a JSON file and read them
 * back (options page → "Settings file"). Pure helpers, easy to test.
 *
 * Only settings travel. The list of recently opened files stays on this
 * computer, and so do the web sites the user allowed: Chrome must ask the
 * user again for those.
 */
import { sanitizeExts } from './file-types'
import { getReading } from './reading-config'

/** the file's mark; the extension's old name, kept so older files still load */
export const SETTINGS_APP = 'AnyRead MD'
export const SETTINGS_KIND = 'settings'

/** what a settings file may hold */
export const SETTINGS_KEYS = [
  'enable',
  'language',
  'pageTheme',
  'centered',
  'hiddenSide',
  'refresh',
  'sideTab',
  'dirView',
  'dirShowAll',
  'dirShowHidden',
  'dirSideHidden',
  'linkPreview',
  'previewWidth',
  'recentOn',
  'mdPlugins',
  'mdConfig',
  'codeExts',
  'reading',
  'customCss',
] as const

const BOOLEANS = [
  'enable',
  'centered',
  'hiddenSide',
  'refresh',
  'dirView',
  'dirShowAll',
  'dirShowHidden',
  'dirSideHidden',
  'linkPreview',
  'recentOn',
]
const CORE_KEYS = ['html', 'breaks', 'linkify', 'typographer']
const MAX_CSS = 200_000
/** largest settings file read, in bytes (real ones are a few KB) */
export const MAX_SETTINGS_FILE = 1_000_000

export interface SettingsFile {
  app: string
  kind: string
  version: string
  exported: string
  settings: Record<string, unknown>
}

/** names this build knows, passed in so the module stays free of chrome.* */
export interface Allowed {
  languages: string[]
  themes: string[]
  plugins: string[]
  /** plugins (and "Linkify") that take an options object */
  configurable: string[]
}

/** the settings part of what is stored, ready to save as a file */
export function exportSettings(
  stored: Record<string, unknown>,
  version: string,
  now = new Date(),
): SettingsFile {
  const settings: Record<string, unknown> = {}
  for (const key of SETTINGS_KEYS) {
    if (stored[key] !== undefined) settings[key] = stored[key]
  }
  return {
    app: SETTINGS_APP,
    kind: SETTINGS_KIND,
    version,
    exported: now.toISOString(),
    settings,
  }
}

/** file name for a settings file saved on `now`: anyread-md-settings-2026-11-18.json */
export function settingsFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}`
  return `anyread-md-settings-${day}.json`
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Read a settings file. Throws when the text is not one; otherwise returns
 * the settings that are valid and the names of those that were left out.
 */
export function readSettingsFile(
  text: string,
  allowed: Allowed,
): { settings: Record<string, unknown>; skipped: string[] } {
  if (text.length > MAX_SETTINGS_FILE) throw new Error('file too large')
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error('not JSON')
  }
  if (
    !isObject(file) ||
    file.app !== SETTINGS_APP ||
    file.kind !== SETTINGS_KIND ||
    !isObject(file.settings)
  ) {
    throw new Error('not an AnyRead settings file')
  }

  const input = file.settings
  const settings: Record<string, unknown> = {}
  const skipped: string[] = []
  const keep = (key: string, value: unknown) => {
    if (value === undefined) skipped.push(key)
    else settings[key] = value
  }

  for (const key of Object.keys(input)) {
    const v = input[key]
    if (!(SETTINGS_KEYS as readonly string[]).includes(key)) {
      skipped.push(key)
    } else if (BOOLEANS.includes(key)) {
      keep(key, typeof v === 'boolean' ? v : undefined)
    } else if (key === 'language') {
      keep(key, allowed.languages.includes(v as string) ? v : undefined)
    } else if (key === 'pageTheme') {
      keep(key, allowed.themes.includes(v as string) ? v : undefined)
    } else if (key === 'sideTab') {
      keep(key, v === 'toc' || v === 'files' ? v : undefined)
    } else if (key === 'previewWidth') {
      const n = Number(v)
      keep(key, typeof v === 'number' && n >= 0.2 && n <= 0.8 ? n : undefined)
    } else if (key === 'mdPlugins') {
      keep(
        key,
        Array.isArray(v)
          ? allowed.plugins.filter(p => (v as unknown[]).includes(p))
          : undefined,
      )
    } else if (key === 'mdConfig') {
      keep(key, cleanMdConfig(v, allowed.configurable))
    } else if (key === 'codeExts') {
      keep(key, Array.isArray(v) ? sanitizeExts(v) : undefined)
    } else if (key === 'reading') {
      keep(key, isObject(v) ? getReading(v as any) : undefined)
    } else if (key === 'customCss') {
      keep(key, typeof v === 'string' && v.length <= MAX_CSS ? v : undefined)
    }
  }
  return { settings, skipped }
}

/** markdown options: the four core switches and an options object per plugin */
function cleanMdConfig(v: unknown, configurable: string[]) {
  if (!isObject(v)) return undefined
  const core: Record<string, boolean> = {}
  if (isObject(v.core)) {
    for (const k of CORE_KEYS) {
      if (typeof v.core[k] === 'boolean') core[k] = v.core[k] as boolean
    }
  }
  const plugins: Record<string, Record<string, unknown>> = {}
  if (isObject(v.plugins)) {
    for (const name of configurable) {
      const opts = v.plugins[name]
      if (isObject(opts)) plugins[name] = JSON.parse(JSON.stringify(opts))
    }
  }
  return { core, plugins }
}
