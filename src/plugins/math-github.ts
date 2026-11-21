import type { MarkdownIt } from 'markdown-it'

/**
 * The two ways GitHub writes math that the KaTeX plugin does not read:
 *
 *   ```math          a block (as $$ ... $$)
 *   $`a^2 + b^2`$    inline (as $ ... $)
 *
 * Both are handed to the KaTeX plugin's own renderers, so they look, export
 * and fail (source shown, marked as an error) exactly like $ and $$. Install
 * after the KaTeX plugin; without it, nothing changes.
 */
export default function MathGithubPlugin(md: MarkdownIt) {
  const rules = md.renderer.rules
  if (!rules.math_block || !rules.math_inline) return

  // ```math fences
  const fallbackFence = rules.fence?.bind(rules)
  rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim().split(/\s+/)[0].toLowerCase() === 'math') {
      return rules.math_block(tokens, idx, options, env, self)
    }
    if (fallbackFence) return fallbackFence(tokens, idx, options, env, self)
    return self.renderToken(tokens, idx, options)
  }

  // $`...`$ inline: read before the KaTeX plugin's $ rule and code spans
  md.inline.ruler.before('escape', 'math_inline_github', (state, silent) => {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false
    if (state.src.charCodeAt(start + 1) !== 0x60 /* ` */) return false
    const end = state.src.indexOf('`$', start + 2)
    if (end < 0) return false
    const content = state.src.slice(start + 2, end)
    if (!content.trim() || content.includes('`')) return false
    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.markup = '$`'
      token.content = content
    }
    state.pos = end + 2
    return true
  })
}
