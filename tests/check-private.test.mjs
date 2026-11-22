import test from 'node:test'
import assert from 'node:assert/strict'
import { findProblems, parseWords } from '../scripts/check-private.mjs'

// Test values are put together from pieces, so this file itself passes the check.
const at = '@'
const rules = text => findProblems(text).map(p => p.rule)

test('home folders with a user name are blocked', () => {
  assert.deepEqual(rules('C:' + '\\Users\\' + 'someone\\Desktop\\a.md'), [
    'home folder with a user name',
  ])
  assert.deepEqual(rules('file:///C:' + '/Users/' + 'SOMEONE~1.ABC/AppData'), [
    'home folder with a user name',
  ])
  assert.deepEqual(rules('/ho' + 'me/alice/notes'), [
    'home folder with a user name',
  ])
  assert.deepEqual(rules('/Us' + 'ers/bob/Documents'), [
    'home folder with a user name',
  ])
  // shared folders and CI runners are fine
  assert.deepEqual(rules('C:' + '\\Users\\' + 'Public\\Documents'), [])
  assert.deepEqual(rules('/ho' + 'me/runner/work'), [])
  assert.deepEqual(rules('file:///C:/docs/'), [])
})

test('e-mail addresses are blocked, except no-reply and example ones', () => {
  assert.deepEqual(rules('mail me: jane.doe' + at + 'company.test'), [
    'e-mail address',
  ])
  assert.deepEqual(
    rules('Co-Authored-By: Claude <noreply' + at + 'anthropic.com>'),
    [],
  )
  assert.deepEqual(rules('user' + at + 'example.com'), [])
  assert.deepEqual(rules('import x from "@scope/pkg"'), [])
})

test('private network addresses are blocked, localhost is fine', () => {
  assert.deepEqual(rules('http://192.' + '168.1.20:8080'), [
    'private network address',
  ])
  assert.deepEqual(rules('10.' + '0.0.5'), ['private network address'])
  assert.deepEqual(rules('172.' + '20.1.1'), ['private network address'])
  assert.deepEqual(rules('http://127.0.0.1:9/page'), [])
  assert.deepEqual(rules('version 10.2 of 172 items'), [])
})

test('keys and tokens are blocked', () => {
  assert.deepEqual(rules('-----BEGIN ' + 'RSA PRIVATE KEY-----'), [
    'key or token',
  ])
  assert.deepEqual(rules('token = gh' + 'p_' + 'a'.repeat(36)), [
    'key or token',
  ])
  assert.deepEqual(rules('AKIA' + 'ABCDEFGHIJKLMNOP'), ['key or token'])
})

test('words of your own, plain or as a regular expression', () => {
  const words = parseWords('# a comment\n\nAcme Corp\n/proj[-_]?x/\n')
  assert.equal(words.length, 2)
  assert.deepEqual(
    findProblems('built for ACME CORP', words).map(p => p.found),
    ['ACME CORP'],
  )
  assert.deepEqual(
    findProblems('see proj_x/readme', words).map(p => p.found),
    ['proj_x'],
  )
  assert.deepEqual(findProblems('nothing here', words), [])
})

test('network share paths are blocked, escaped paths in code are not', () => {
  const bs = String.fromCharCode(92) // a backslash
  assert.deepEqual(rules(bs + bs + 'fileserver' + bs + 'team' + bs + 'a.md'), [
    'network share path',
  ])
  assert.deepEqual(rules('see ' + bs + bs + 'nas01' + bs + 'docs'), [
    'network share path',
  ])
  // a C: path written in a JS string (each backslash doubled) is not a share
  assert.deepEqual(rules('C:' + bs + bs + 'docs' + bs + bs + 'a'), [])
  assert.deepEqual(rules('a regex: /[' + bs + bs + '/]+/'), [])
})

test('paths on drives E: to Z: are blocked, C: and D: are fine', () => {
  const bs = String.fromCharCode(92) // a backslash
  assert.deepEqual(rules('Z' + ':' + bs + 'dev' + bs + 'notes.md'), [
    'path on a drive E: to Z:',
  ])
  assert.deepEqual(rules('file:///' + 'E' + ':/share/a.md'), [
    'path on a drive E: to Z:',
  ])
  assert.deepEqual(
    rules('C:' + bs + 'docs' + bs + 'a.md and D:/tools/anyread'),
    [],
  )
  // a drive on its own, words ending in a letter and a colon
  assert.deepEqual(rules('the top of a drive (such as Z' + ':)'), [])
  assert.deepEqual(rules('file:///docs and type: /x/'), [])
})

test('internal domains in addresses are blocked', () => {
  assert.deepEqual(rules('https://wiki.' + 'corp/page'), ['internal domain'])
  assert.deepEqual(rules('http://build-01.' + 'local:8080'), [
    'internal domain',
  ])
  assert.deepEqual(rules('smb://nas.home.' + 'arpa/x'), ['internal domain'])
  // code, not an address
  assert.deepEqual(rules('chrome.storage.local.get()'), [])
  assert.deepEqual(rules('https://example.com/local'), [])
})
