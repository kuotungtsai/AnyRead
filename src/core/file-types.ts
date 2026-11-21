/**
 * Extra file types the user asked md-reader to open as a highlighted code
 * view (options page → "Extra file types"). Markdown types stay hard-coded in
 * the manifest; these are registered at runtime by the background worker.
 */

export const MD_EXTS = ['md', 'mdx', 'mkd', 'markdown']
/** spreadsheet files, shown as a table (Chrome would download them) */
export const TABLE_EXTS = ['csv', 'tsv', 'xlsx', 'xlsm']
/** Excel workbooks (zip + XML), read by core/xlsx */
export const WORKBOOK_EXTS = ['xlsx', 'xlsm']
/** Mermaid diagram files, drawn as a diagram */
export const DIAGRAM_EXTS = ['mmd', 'mermaid']
/** Word and PowerPoint files, shown as their text (Chrome would download them) */
export const OFFICE_EXTS = ['docx', 'pptx']
/** plain text, shown like Markdown (line breaks kept) */
export const TEXT_EXTS = ['txt']
/** data, settings and log files, shown as code without adding them in Settings */
export const CONFIG_EXTS = [
  'json',
  'jsonc',
  'json5',
  'jsonl',
  'ndjson',
  'geojson',
  'yml',
  'yaml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'properties',
  'env',
  'log',
]
/**
 * Files known by their whole name (dotfiles, names without an extension),
 * lower-cased, with the highlight.js language they are shown in. ".env.*"
 * (.env.local ...) counts as .env.
 */
export const CONFIG_NAMES: Record<string, string> = {
  '.gitignore': 'plaintext',
  '.gitattributes': 'plaintext',
  '.gitmodules': 'ini',
  '.dockerignore': 'plaintext',
  '.npmignore': 'plaintext',
  '.prettierignore': 'plaintext',
  '.eslintignore': 'plaintext',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
  '.nvmrc': 'plaintext',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  '.env': 'bash',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  license: 'plaintext',
  licence: 'plaintext',
  codeowners: 'plaintext',
}
/** types AnyRead shows by itself; never registered again as code types */
const BUILT_IN_EXTS = () => [
  ...MD_EXTS,
  ...DIAGRAM_EXTS,
  ...TEXT_EXTS,
  ...TABLE_EXTS,
  ...OFFICE_EXTS,
  ...CONFIG_EXTS,
]

/** a plain extension: letters/digits, optionally with _ + - (e.g. c, h, cpp, c++, tsx) */
const EXT_RE = /^[a-z0-9][a-z0-9_+-]{0,15}$/
/** keep the registered match list small */
export const MAX_CODE_EXTS = 50
/** types Chrome shows as a web page / image / document, never a text <pre> */
const BLOCKED = new Set(
  'html htm xhtml shtml php asp aspx jsp svg xml pdf png jpg jpeg gif webp ico bmp avif mp3 mp4 webm wav ogg zip gz exe'.split(
    ' ',
  ),
)

/** extension → highlight.js language when the extension is not itself a hljs name/alias */
const LANG_ALIASES: Record<string, string> = {
  h: 'c',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cxx: 'cpp',
  'c++': 'cpp',
  'h++': 'cpp',
  inl: 'cpp',
  txt: 'plaintext',
  text: 'plaintext',
  log: 'plaintext',
  jsonc: 'json',
  json5: 'json',
  jsonl: 'json',
  ndjson: 'json',
  geojson: 'json',
  yml: 'yaml',
  toml: 'ini',
  env: 'bash',
  cfg: 'ini',
  conf: 'ini',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  pyw: 'python',
  bat: 'dos',
  cmd: 'dos',
  ps1: 'powershell',
  psm1: 'powershell',
  s: 'x86asm',
  asm: 'x86asm',
}

export interface ParsedExts {
  exts: string[]
  /** entries that were dropped, as typed */
  invalid: string[]
}

/**
 * Parse "c, h, .cpp *.py txt" into ['c', 'h', 'cpp', 'py', 'txt'].
 * Wildcards and anything that is not a plain extension are rejected, so the
 * result can never match every URL. Markdown types are dropped (always on).
 */
export function parseExtensions(input: string | string[] = ''): ParsedExts {
  const parts = (Array.isArray(input) ? input : String(input).split(/[\s,;]+/))
    .map(s => String(s).trim())
    .filter(Boolean)
  const exts: string[] = []
  const invalid: string[] = []
  for (const raw of parts) {
    const ext = raw.replace(/^\*?\./, '').toLowerCase()
    if (!EXT_RE.test(ext) || BLOCKED.has(ext) || exts.length >= MAX_CODE_EXTS) {
      invalid.push(raw)
    } else if (!BUILT_IN_EXTS().includes(ext) && !exts.includes(ext)) {
      exts.push(ext)
    }
  }
  return { exts, invalid }
}

/** only trust what the validator accepts, whatever is in storage */
export const sanitizeExts = (saved: unknown): string[] =>
  Array.isArray(saved) ? parseExtensions(saved as string[]).exts : []

/** decoded last path segment of a URL (or a plain file name) */
export function fileName(url: string): string {
  let path = url.split('#')[0].split('?')[0]
  try {
    path = decodeURIComponent(path)
  } catch {
    // keep the encoded path
  }
  return path.slice(path.lastIndexOf('/') + 1)
}

/** lower-cased extension of a URL's last path segment ('' when none) */
export function urlExtension(url: string): string {
  const name = fileName(url)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export const isMarkdownName = (name: string) =>
  MD_EXTS.includes(urlExtension(name))

export const isTableName = (name: string) =>
  TABLE_EXTS.includes(urlExtension(name))

export const isWorkbookName = (name: string) =>
  WORKBOOK_EXTS.includes(urlExtension(name))

export const isOfficeName = (name: string) =>
  OFFICE_EXTS.includes(urlExtension(name))

/** files shown on the extension's own page (the table page): tables, Word,
 *  PowerPoint. Chrome would only download them. */
export const isPageName = (name: string) =>
  isTableName(name) || isOfficeName(name)

export const isDiagramName = (name: string) =>
  DIAGRAM_EXTS.includes(urlExtension(name))

export const isPlainTextName = (name: string) =>
  TEXT_EXTS.includes(urlExtension(name))

/** a file known by its whole name (.gitignore, Dockerfile...): its language */
export function namedFileLanguage(url: string): string | null {
  const name = fileName(url).toLowerCase()
  if (Object.prototype.hasOwnProperty.call(CONFIG_NAMES, name))
    return CONFIG_NAMES[name]
  if (/^\.env\.[\w.-]+$/.test(name)) return 'bash' // .env.local ...
  return null
}

/**
 * The highlight.js language a file is shown in as code: the built-in data,
 * settings and log types, files known by name, then the user's own types
 * (Settings → Extra file types). null for anything else.
 */
export function codeTypeOf(
  url: string,
  codeExts: string[] = [],
): string | null {
  const named = namedFileLanguage(url)
  if (named) return named
  const ext = urlExtension(url)
  if (CONFIG_EXTS.includes(ext) || sanitizeExts(codeExts).includes(ext)) {
    return codeLanguage(ext)
  }
  return null
}

/** plain text or code the pane shows: .txt, the built-in code types, the user's */
export function textMatcher(codeExts: string[] = []) {
  return (name: string) => isPlainTextName(name) || !!codeTypeOf(name, codeExts)
}

/** matcher for file names AnyRead opens: markdown, tables, the user's code types */
export function viewableMatcher(codeExts: string[] = []) {
  const all = [
    ...MD_EXTS,
    ...DIAGRAM_EXTS,
    ...TEXT_EXTS,
    ...TABLE_EXTS,
    ...OFFICE_EXTS,
    ...CONFIG_EXTS,
    ...sanitizeExts(codeExts),
  ]
  return (name: string) =>
    all.includes(urlExtension(name)) || !!namedFileLanguage(name)
}

/** highlight.js language for a code extension (hljs aliases resolve the rest) */
export const codeLanguage = (ext: string): string => LANG_ALIASES[ext] || ext

/** most characters of a code file drawn (a long log stays responsive) */
export const MAX_CODE_CHARS = 1_000_000

/**
 * A code file's text as it is shown: JSON pretty-printed (when it parses;
 * .jsonc / .json5 keep their comments and layout), and only the first
 * MAX_CODE_CHARS of a very long file. `cut` is the size of the whole text
 * when it was cut.
 */
export function prepareCode(
  text: string,
  url: string,
): { text: string; cut?: number } {
  const ext = urlExtension(url)
  if (
    (ext === 'json' ||
      ext === 'geojson' ||
      namedFileLanguage(url) === 'json') &&
    text.length <= MAX_CODE_CHARS
  ) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2) + '\n'
    } catch {
      // not valid JSON: shown as written
    }
  }
  if (text.length > MAX_CODE_CHARS) {
    const end = text.lastIndexOf('\n', MAX_CODE_CHARS)
    return {
      text: text.slice(0, end > 0 ? end + 1 : MAX_CODE_CHARS),
      cut: text.length,
    }
  }
  return { text }
}

/** wrap raw text as one fenced block, with a fence longer than any ` run inside */
export function toCodeFence(code: string, language: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) || []).map(s => s.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n`
}

export const FILE_BASE = 'file:///'
const ALL_SITES = '*://*/'

/**
 * Turn the site permissions the user granted ("*://*\/*",
 * "https://example.com/*") into pattern prefixes. Local files are covered by
 * the manifest, so only web sites are returned.
 */
export function webBases(origins: string[] = []): string[] {
  const bases: string[] = []
  for (const origin of origins) {
    const o = origin === '<all_urls>' ? ALL_SITES + '*' : origin
    if (!/^(\*|https?):\/\//.test(o) || !o.endsWith('/*')) continue
    const base = o.slice(0, -1)
    if (!bases.includes(base)) bases.push(base)
  }
  return bases.includes(ALL_SITES) ? [ALL_SITES] : bases
}

/** content_scripts match patterns (both cases, with/without ?query) */
export function patternsFor(exts: string[], bases: string[]): string[] {
  const patterns: string[] = []
  for (const ext of exts) {
    for (const e of new Set([ext, ext.toUpperCase()])) {
      for (const base of bases) {
        patterns.push(`${base}*.${e}`, `${base}*.${e}?*`)
      }
    }
  }
  return patterns
}

/** patterns for the user's code file types: local files + allowed sites */
export function matchPatterns(exts: string[], bases: string[] = []): string[] {
  return patternsFor(sanitizeExts(exts), [FILE_BASE, ...bases])
}

/** the site pattern to ask for when the user allows one web page */
export function originPattern(url: string): string | null {
  try {
    const u = new URL(url)
    return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.host}/*` : null
  } catch {
    return null
  }
}

/**
 * The folder above a file:// folder, or null at the top: a Windows drive
 * (file:///C:/ — above it Chrome lists nothing), a network share
 * (file://server/share/) or the root (file:///). On Linux and macOS a
 * first-level folder such as file:///srv/ goes up to file:///.
 */
export function parentFolder(dir: string): string | null {
  let url: URL
  try {
    url = new URL(dir)
  } catch {
    return null
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (!parts.length) return null
  if (parts.length === 1 && (url.host || /^[A-Za-z]:$/.test(parts[0]))) {
    return null
  }
  return new URL('../', url.href.replace(/[?#].*$/, '')).href
}
