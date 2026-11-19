/**
 * A very small XML reader for the parts of Office files: elements,
 * attributes and text, nothing more (no DTD, no entities beyond the standard
 * ones, namespaces only as name prefixes). Runs anywhere, the background
 * worker included, where there is no DOMParser.
 */

export interface XNode {
  name: string
  attrs: Record<string, string>
  kids: (XNode | string)[]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code =
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)
        return Number.isFinite(code) ? String.fromCodePoint(code) : m
      }
      return ENTITIES[e] ?? m
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
}

// CDATA | comment | <?...?> | <!...> | </end> | <start attrs /> | text
const TOKEN =
  /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** the document as a tree; its root is a "#root" node holding the top element */
export function parseXml(xml: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, kids: [] }
  const stack = [root]
  for (const m of xml.matchAll(TOKEN)) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) top.kids.push(m[1])
    else if (m[2] !== undefined) {
      // close the matching element (forgiving about stray end tags)
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === m[2]) {
          stack.length = i
          break
        }
      }
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {}
      for (const a of (m[4] || '').matchAll(ATTR)) {
        attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? '')
      }
      const node: XNode = { name: m[3], attrs, kids: [] }
      top.kids.push(node)
      if (!m[5]) stack.push(node)
    } else if (m[6] !== undefined) top.kids.push(unescapeXml(m[6]))
  }
  return root
}

/** a name without its prefix: "w:p" → "p" */
export const local = (name: string) => name.slice(name.indexOf(':') + 1)

const isNode = (k: XNode | string): k is XNode => typeof k !== 'string'

/** the child elements, all or those with this local name */
export function kids(node: XNode | null | undefined, name?: string): XNode[] {
  if (!node) return []
  return node.kids.filter(
    (k): k is XNode => isNode(k) && (!name || local(k.name) === name),
  )
}

/** the first child element with this local name */
export function first(
  node: XNode | null | undefined,
  name: string,
): XNode | null {
  if (!node) return null
  for (const k of node.kids) if (isNode(k) && local(k.name) === name) return k
  return null
}

/** the first element below with this local name (depth first) */
export function find(
  node: XNode | null | undefined,
  name: string,
): XNode | null {
  if (!node) return null
  for (const k of node.kids) {
    if (!isNode(k)) continue
    if (local(k.name) === name) return k
    const deep = find(k, name)
    if (deep) return deep
  }
  return null
}

/** every element below with this local name, in document order */
export function findAll(
  node: XNode | null | undefined,
  name: string,
  out: XNode[] = [],
): XNode[] {
  if (!node) return out
  for (const k of node.kids) {
    if (!isNode(k)) continue
    if (local(k.name) === name) out.push(k)
    findAll(k, name, out)
  }
  return out
}

/** an attribute by its full name ("r:id"), else by local name ("val" for "w:val") */
export function attr(
  node: XNode | null | undefined,
  name: string,
): string | undefined {
  if (!node) return undefined
  if (name in node.attrs) return node.attrs[name]
  for (const k in node.attrs) if (local(k) === name) return node.attrs[k]
  return undefined
}

/** the text below an element, as one string */
export function textOf(node: XNode | null | undefined): string {
  if (!node) return ''
  let s = ''
  for (const k of node.kids) s += isNode(k) ? textOf(k) : k
  return s
}
