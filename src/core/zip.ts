/**
 * Reading the parts of a zip file, as Office files (.xlsx, .docx, .pptx) are
 * zips of XML files. Uses the browser's own unzip (DecompressionStream), so it
 * needs no library and also runs in the background worker and in Node.
 */
import { TOO_LARGE } from './table'

interface ZipEntry {
  method: number
  size: number
  offset: number
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u32 = (b: Uint8Array, i: number) =>
  (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0

function zipEntries(b: Uint8Array): Map<string, ZipEntry> {
  // end of central directory: the last 22 bytes, plus a comment of up to 64 KB
  let end = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('not a zip file')
  const count = u16(b, end + 10)
  let p = u32(b, end + 16)
  const names = new TextDecoder()
  const entries = new Map<string, ZipEntry>()
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('broken zip directory')
    const method = u16(b, p + 10)
    const size = u32(b, p + 20)
    const nameLen = u16(b, p + 28)
    const extraLen = u16(b, p + 30)
    const commentLen = u16(b, p + 32)
    const local = u32(b, p + 42)
    const name = names.decode(b.subarray(p + 46, p + 46 + nameLen))
    // the data starts after the local header, whose extra field may differ
    const offset = local + 30 + u16(b, local + 26) + u16(b, local + 28)
    entries.set(name.replace(/\\/g, '/'), { method, size, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** most bytes one part of a file may unpack to (a sheet's or document's XML) */
const MAX_PART = 64 * 1024 * 1024

/** unpack a zip entry, giving up past MAX_PART (a "zip bomb" stops here) */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_PART) {
      reader.cancel().catch(() => {})
      throw new Error(TOO_LARGE)
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

export interface Zip {
  /** a part's bytes, or null when the zip has no such part */
  bytes(name: string): Promise<Uint8Array | null>
  /** a part as text (UTF-8), or null when the zip has no such part */
  text(name: string): Promise<string | null>
}

export function openZip(bytes: ArrayBuffer | Uint8Array): Zip {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const entries = zipEntries(b)
  const read = async (name: string) => {
    const e = entries.get(name)
    if (!e) return null
    const raw = b.subarray(e.offset, e.offset + e.size)
    if (e.method === 0) return raw
    if (e.method === 8) return inflate(raw)
    throw new Error('unsupported zip compression')
  }
  return {
    bytes: read,
    async text(name) {
      const data = await read(name)
      return data && new TextDecoder().decode(data)
    },
  }
}

/** the folder of a zip path: "xl/workbook.xml" → "xl/" */
export const folderOf = (path: string) =>
  path.slice(0, path.lastIndexOf('/') + 1)

/** resolve a relationship target against its folder ("../a", "/xl/a") */
export function joinPath(folder: string, target: string): string {
  const parts = (
    target.startsWith('/') ? target.slice(1) : folder + target
  ).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}
