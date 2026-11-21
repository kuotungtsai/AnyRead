/**
 * Write the demo: a made-up team handbook with one example of every
 * feature (tests/e2e/demo.mjs), to try AnyRead MD.
 *
 *   pnpm demo              into demo/ in this repository (ignored by git)
 *   pnpm demo <folder>     anywhere else
 *
 * Only writes files, never deletes. It writes into a folder only when the
 * folder is new, empty, or an earlier demo (it has a .anyread-demo file).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEMO_MARK, makeDemo } from '../tests/e2e/demo.mjs'
import { workbook, reportDocx, deckPptx } from '../tests/e2e/fixtures.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.resolve(process.argv[2] || path.join(root, 'demo'))

if (fs.existsSync(target)) {
  const items = fs.readdirSync(target)
  if (items.length && !items.includes(DEMO_MARK)) {
    console.error(
      `${target} already has files that are not a demo. Nothing was written.\n` +
        'Choose another folder: pnpm demo <folder>',
    )
    process.exit(1)
  }
}

makeDemo(target, { workbook, reportDocx, deckPptx })
const ext = path.join(root, 'extension')
console.log(`Demo written to ${target}

Try it:
  1. Load the extension: chrome://extensions, turn on Developer mode,
     "Load unpacked", choose ${ext}
     (build it first: npx pnpm@9 build:extension; turn off another AnyRead MD
     while you try this one)
  2. Open the demo's folder page:  ${pathToFileURL(target).href}/
     or its guide:                 ${
       pathToFileURL(path.join(target, 'README.md')).href
     }`)
