/**
 * Keep personal data out of commits. Checks the added lines and file names
 * of a change, and commit messages, for things no public repository should
 * get: home folders with a user name in them, e-mail addresses, private
 * network addresses, keys and tokens. Words of your own (an employer, a
 * customer, internal project names) go in a file that is never committed:
 *
 *   <git dir>/sensitive-words.txt   one word or /regular expression/ a line,
 *                                   # for comments; matched ignoring case
 *
 * Usage:
 *   node scripts/check-private.mjs                 staged changes (pre-commit)
 *   node scripts/check-private.mjs --msg <file>    a commit message (commit-msg)
 *   node scripts/check-private.mjs --since <ref>   everything after <ref>,
 *                                                  messages included (before a push)
 *
 * Exit code 1 and "BLOCKED" when something is found. New or changed pictures
 * are listed under "REVIEW": look at them, a screenshot can show anything.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** addresses allowed in text: no-reply senders and the example domains */
const ALLOWED_EMAIL =
  /^(noreply@|no-reply@)|@(example\.(com|org|net)|users\.noreply\.github\.com)$/i

/** the checks every repository gets; each finds the offending part of a line */
export const RULES = [
  {
    name: 'home folder with a user name',
    re: /\b[A-Za-z]:[\\/]+Users[\\/]+(?!(Public|Default|All Users)\b)[^\\/\s'"`<>|:*?]+|\/home\/(?!runner\b)[a-z0-9._-]+|\/Users\/(?!(Shared|Public)\b)[A-Za-z0-9._-]+/,
  },
  {
    name: 'e-mail address',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    allow: m => ALLOWED_EMAIL.test(m),
  },
  {
    name: 'private network address',
    re: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/,
  },
  {
    name: 'key or token',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bsk-[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{35}\b/,
  },
]

const PICTURE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|pdf)$/i
/** files with hashes and generated text that only look like keys */
const SKIP_FILES = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/

/** words from <git dir>/sensitive-words.txt, as regular expressions */
export function parseWords(text) {
  const out = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^\/(.+)\/$/.exec(line)
    out.push(
      new RegExp(m ? m[1] : line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    )
  }
  return out
}

/** what a piece of text breaks: [{ rule, found }] */
export function findProblems(text, words = []) {
  const out = []
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.replace('g', '') + 'g')
    for (const m of text.matchAll(re)) {
      if (rule.allow?.(m[0])) continue
      out.push({ rule: rule.name, found: m[0] })
    }
  }
  for (const w of words) {
    const m = w.exec(text)
    if (m) out.push({ rule: 'a word in sensitive-words.txt', found: m[0] })
  }
  return out
}

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

function loadWords() {
  try {
    const file = path.resolve(
      git('rev-parse', '--git-common-dir').trim(),
      'sensitive-words.txt',
    )
    return fs.existsSync(file) ? parseWords(fs.readFileSync(file, 'utf8')) : []
  } catch {
    return []
  }
}

/** added lines of a diff, with their file and line number */
function addedLines(diff) {
  const out = []
  let file = ''
  let line = 0
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) {
      file = l.slice(4).replace(/^b\//, '')
    } else if (l.startsWith('@@')) {
      line = +(/\+(\d+)/.exec(l)?.[1] || 0)
    } else if (l.startsWith('+')) {
      out.push({ file, line, text: l.slice(1) })
      line++
    }
  }
  return out
}

function main(argv) {
  const words = loadWords()
  const problems = []
  const report = (where, text) => {
    for (const p of findProblems(text, words)) problems.push({ where, ...p })
  }

  const msgAt = argv.indexOf('--msg')
  const sinceAt = argv.indexOf('--since')
  let names = []
  let changed = []
  if (msgAt >= 0) {
    const text = fs.readFileSync(argv[msgAt + 1], 'utf8')
    text.split(/\r?\n/).forEach((t, i) => {
      if (!t.startsWith('#')) report(`commit message:${i + 1}`, t)
    })
  } else {
    const range = sinceAt >= 0 ? [`${argv[sinceAt + 1]}..HEAD`] : ['--cached']
    const diff = git('diff', ...range, '-U0', '--no-color', '--no-ext-diff')
    for (const a of addedLines(diff)) {
      if (!SKIP_FILES.test(a.file)) report(`${a.file}:${a.line}`, a.text)
    }
    names = git('diff', ...range, '--name-only')
      .split('\n')
      .filter(Boolean)
    changed = git('diff', ...range, '--name-only', '--diff-filter=AM')
      .split('\n')
      .filter(n => PICTURE.test(n))
    for (const n of names) report(`file name ${n}`, n)
    if (sinceAt >= 0) {
      const log = git(
        'log',
        `${argv[sinceAt + 1]}..HEAD`,
        '--format=%H%n%an%n%ae%n%B%n@@end',
      )
      for (const block of log.split('@@end\n')) {
        const [hash, , email, ...msg] = block.split('\n')
        if (!hash) continue
        msg.forEach((t, i) =>
          report(`message of ${hash.slice(0, 7)}:${i + 1}`, t),
        )
        void email // authors are set by git config; see AGENTS.md
      }
    }
  }

  for (const p of problems) {
    console.log(`BLOCKED ${p.where}: ${p.rule}: ${p.found}`)
  }
  if (changed.length) {
    console.log('REVIEW new or changed pictures (look at each one):')
    for (const n of changed) console.log(`  ${n}`)
  }
  if (!words.length && msgAt < 0) {
    console.log(
      'note: no sensitive-words.txt in the git folder; only the general checks ran',
    )
  }
  if (problems.length) {
    console.log(
      `check-private: ${problems.length} problem(s); remove them before committing`,
    )
    return 1
  }
  console.log('check-private: OK')
  return 0
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  process.exit(main(process.argv.slice(2)))
}
