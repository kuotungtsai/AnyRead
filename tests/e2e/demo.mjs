/**
 * The demo: a made-up team handbook with one example of every feature, for
 * people to try and for the browser tests to walk through (spec "demo").
 * All content is invented. Written by `pnpm demo` (scripts/demo.mjs) and by
 * the test runner into tests/e2e/.work/handbook/.
 *
 * makeDemo() only writes files: it never deletes anything.
 */
import fs from 'node:fs'
import path from 'node:path'

/** marks a folder as made by makeDemo, so `pnpm demo` may write into it again */
export const DEMO_MARK = '.anyread-demo'

/** a small valid PDF of one page with a line of text */
function pdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // the content stream, below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const stream = `BT /F1 18 Tf 40 100 Td (${text}) Tj ET`
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const at = []
  objs.forEach((o, i) => {
    at.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const n of at) out += `${String(n).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${
    objs.length + 1
  } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
  <rect width="240" height="120" rx="18" fill="#1e2530"/>
  <text x="120" y="72" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#ffc233" text-anchor="middle">SYNC</text>
</svg>
`

/**
 * Write the demo into `root`. The builders for zip-based files come from
 * the caller (fixtures.mjs), so both use the same code.
 */
export function makeDemo(root, { workbook, reportDocx, deckPptx }) {
  const put = (rel, value) => {
    const file = path.join(root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value)
  }
  put(
    DEMO_MARK,
    'Made by `pnpm demo` (AnyRead MD). Everything here is invented.\n',
  )

  put(
    'README.md',
    `# AnyRead MD demo

A made-up team handbook with one example of every feature. Everything here is
invented. Open this file in Chrome to read it, or open its folder for the
folder page.

## Markdown, opened on the right

- [Getting started](getting-started.md): every link in it opens in the split view, so the list stays.
- [Architecture overview](architecture.md): front matter, a Mermaid diagram, a table, callouts, a task list.
- [Capacity planning](capacity-planning.md): formulas in all four ways GitHub writes them, a Gantt chart, code.
- [Release checklist](release-checklist.md) and [meeting notes](meeting-notes-2026-11.md).
- [The request flow section](architecture.md#request-flow): a link to a heading in another file.

## Text and diagrams

- [Notes](notes.txt): a .txt file, read as Markdown with its line breaks kept.
- [Sync flow](flow.mmd): a Mermaid file, drawn as a diagram.

## Tables

- [Devices](data/devices.csv) (CSV) and [regions](data/regions.tsv) (TSV).
- [Release metrics](data/release-metrics.xlsx): an Excel workbook with three sheets, dates and percentages.

## Word and PowerPoint

- [Design review](docs/design-review.docx): headings, lists, a table, a picture, a footnote.
- [Release review](docs/release-review.pptx): each slide with its speaker notes; one slide hidden.

## Data and settings files

- [App settings](config/app.json) (JSON, pretty-printed), [editor settings](config/settings.jsonc) (JSONC), [deploy](config/deploy.yml) (YAML), [pyproject.toml](config/pyproject.toml), [.env.example](config/.env.example).
- [.editorconfig](.editorconfig), [.gitignore](.gitignore), [Dockerfile](Dockerfile), [Makefile](Makefile), [LICENSE](LICENSE).
- [A long log](logs/sync.log): over 1 MB, shown in part with a note.

## Pictures and PDF (a new tab)

- [Logo](assets/logo.svg) and [spec sheet](assets/spec-sheet.pdf) open in a new tab, so this page stays.

## Folders

- [Guides](guides/): a folder opens as the folder page. On the folder page, tick "Show hidden files" to see the \`.drafts\` folder.

## Other web sites

- [CommonMark help](https://commonmark.org/help/): links to other sites open in a new tab.
`,
  )

  put(
    'getting-started.md',
    `# Getting started

Welcome to the sync service team! This page lists what to read in your first week. Click any link: it opens on the right, so this list stays where it is.

## Day 1: the big picture

1. Read the [Architecture overview](architecture.md) to see how a change travels between devices, and its [request flow](architecture.md#request-flow).
2. Skim [ADR 001: Use a message queue](decisions/adr-001-queue.md) for why the queue exists.
3. Follow [Local setup](guides/local-setup.md) and run every component on your machine.

## Day 2: shipping

- Go through the [Release checklist](release-checklist.md) with your buddy.
- Look at [Capacity planning](capacity-planning.md) before changing anything in the worker.
- Check the [release metrics](data/release-metrics.xlsx) of the last versions.

## Who to ask

| Topic | Channel |
| ----- | ------- |
| API and worker | #platform |
| Web client | #apps |
| Releases | #release |

> [!NOTE]
> Drag the divider between the two panes to give the diagram more room. Esc closes the pane.
`,
  )

  put(
    'architecture.md',
    `---
title: Architecture overview
owner: Platform team
updated: 2026-11-02
---

# Architecture overview

The sync service keeps notes on every device up to date. This page explains how a change travels from the editor to other devices.

## Request flow

\`\`\`mermaid
sequenceDiagram
  participant App
  participant API
  participant Queue
  participant Worker
  App->>API: Save note
  API->>Queue: Publish change
  API-->>App: 202 Accepted
  Queue->>Worker: Deliver change
  Worker-->>App: Push update to other devices
\`\`\`

## Components

| Component | Language | Owner | Status |
| --------- | -------- | ----- | ------ |
| API gateway | Go | Platform | Stable |
| Sync worker | Rust | Platform | Beta |
| Web client | TypeScript | Apps | Stable |

> [!TIP]
> Run \`make dev\` to start every component locally.

## Checklist for new services

- [x] Health check endpoint
- [x] Structured logs
- [ ] Load test before launch
`,
  )

  put(
    'capacity-planning.md',
    `# Capacity planning

## Throughput model

Each worker handles requests at rate $\\mu$, and requests arrive at rate $\\lambda$. Utilisation is

$$
\\rho = \\frac{\\lambda}{c\\,\\mu}, \\qquad W_q \\approx \\frac{\\rho^{\\sqrt{2(c+1)}}}{c\\,\\mu\\,(1-\\rho)}
$$

The same, written the way GitHub also accepts:

\`\`\`math
L = \\lambda W
\`\`\`

Keep $\`\\rho < 0.7\`$ so queues stay short during spikes.

## Rollout plan

\`\`\`mermaid
gantt
  dateFormat YYYY-MM-DD
  title Worker migration
  section Prepare
  Load test        :done, a1, 2026-11-03, 3d
  Capacity review  :active, a2, after a1, 2d
  section Rollout
  10% traffic      :b1, after a2, 2d
  100% traffic     :b2, after b1, 3d
\`\`\`

## Code

\`\`\`rust
fn utilisation(lambda: f64, mu: f64, workers: u32) -> f64 {
    lambda / (workers as f64 * mu)
}
\`\`\`
`,
  )

  put(
    'release-checklist.md',
    `# Release checklist

1. Bump the version in \`package.json\`.
2. Run the full test suite: \`make test\`.
3. Update the changelog.
4. Tag the release and push.

## After release

- [ ] Watch error rates for 30 minutes
- [ ] Post release notes in the team channel

> [!WARNING]
> Never release on a Friday afternoon.
`,
  )
  put(
    'meeting-notes-2026-11.md',
    `# Meeting notes — November

## 2026-11-04

- Agreed to move the sync worker to the new queue.
- **Action:** Mia to draft the migration plan.

## 2026-11-18

- Error rates back to normal after 2.7.
- **Action:** Leo to write the post-mortem.
`,
  )
  put(
    'decisions/adr-001-queue.md',
    `# ADR 001: Use a message queue

Status: accepted

## Context

Saving a note waited for every device to be updated, so slow devices made saving slow.

## Decision

The API publishes each change to a queue and answers at once; workers deliver changes.

## Consequences

- Saving no longer waits for devices.
- A change can arrive a moment later on other devices.
`,
  )
  put(
    'guides/local-setup.md',
    `# Local setup

\`\`\`bash
make dev        # start the API, the queue and a worker
make test       # unit tests
\`\`\`

See the [Makefile](../Makefile) for the rest.
`,
  )
  put(
    'guides/onboarding.md',
    `# Onboarding

Welcome! This guide covers your first two weeks.

## Week 1

- [x] Get access to the repository and the team chat
- [x] Read the [architecture overview](../architecture.md)
- [ ] Run everything with the [local setup](local-setup.md) guide

## Week 2

- [ ] Ship your first change with the [release checklist](../release-checklist.md)
- [ ] Join one on-call shift as a shadow
`,
  )
  put(
    'notes.txt',
    'Notes from the planning session\n\nQueue migration first, then the web client.\nKeep <angle brackets> and "quotes" as written.\nOne line\nper idea.\n',
  )
  put(
    'flow.mmd',
    'flowchart LR\n  Editor[Editor] --> API[API]\n  API --> Queue[(Queue)]\n  Queue --> Worker[Worker]\n  Worker --> Devices[Other devices]\n',
  )

  // tables
  put(
    'data/devices.csv',
    'Platform,Devices,Share\nWindows,18400,41%\nmacOS,9100,20%\nAndroid,11200,25%\niOS,6300,14%\n',
  )
  put(
    'data/regions.tsv',
    'Region\tUsers\tLatency (ms)\nNorth\t12000\t42\nSouth\t8400\t55\nEast\t15100\t38\n',
  )
  put(
    'data/release-metrics.xlsx',
    workbook([
      {
        name: 'Releases',
        rows: [
          ['Version', 'Crash-free sessions', 'Active devices', 'Highlights'],
          ['2.5', 0.9969, 35700, 'Queue-based delivery'],
          ['2.6', 0.9974, 39300, 'Read-only share links'],
          ['2.7', 0.9979, 42800, 'Version history per note'],
        ],
      },
      {
        name: 'Incidents',
        rows: [
          ['Area', 'Minutes', 'Summary'],
          ['Queue', 42, 'Delivery paused during an upgrade'],
          ['Worker', 11, 'Push updates delayed in one region'],
        ],
      },
      {
        name: 'Goals',
        rows: [
          ['Metric', 'Target'],
          ['p95 sync (ms)', 300],
        ],
      },
    ]),
  )

  // Word and PowerPoint (the same builders the tests use)
  put('docs/design-review.docx', reportDocx())
  put('docs/release-review.pptx', deckPptx())

  // data and settings files
  put(
    'config/app.json',
    '{"service":"sync","port":8080,"queue":{"name":"changes","retries":5,"backoff":[1,2,4,8]},"features":{"history":true,"shareLinks":true}}\n',
  )
  put(
    'config/settings.jsonc',
    '{\n  // editor settings for this repository\n  "editor.tabSize": 2,\n  "files.trimTrailingWhitespace": true\n}\n',
  )
  put(
    'config/deploy.yml',
    'service: sync\nreplicas: 3\nresources:\n  cpu: 500m\n  memory: 512Mi\nenv:\n  - name: QUEUE\n    value: changes\n',
  )
  put(
    'config/pyproject.toml',
    '[project]\nname = "sync-tools"\nversion = "0.3.0"\ndependencies = ["requests"]\n\n[tool.ruff]\nline-length = 100\n',
  )
  put(
    'config/.env.example',
    '# copy to .env and fill in\nQUEUE_URL=amqp://localhost:5672\nLOG_LEVEL=info\n',
  )
  put(
    '.editorconfig',
    'root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\n',
  )
  put('.gitignore', 'node_modules/\ndist/\n.env\n*.log\n')
  put(
    'Dockerfile',
    'FROM node:22-slim\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD ["node", "worker.js"]\n',
  )
  put(
    'Makefile',
    'dev:\n\tdocker compose up\n\ntest:\n\tnpm test\n\n.PHONY: dev test\n',
  )
  put(
    'LICENSE',
    'MIT License (sample)\n\nThis demo is invented; this file only shows how a LICENSE file is displayed.\n',
  )
  const levels = ['INFO', 'INFO', 'INFO', 'WARN', 'INFO', 'ERROR']
  put(
    'logs/sync.log',
    Array.from({ length: 16000 }, (_, i) => {
      const s = String(i % 60).padStart(2, '0')
      const m = String(Math.floor(i / 60) % 60).padStart(2, '0')
      return `2026-11-18 10:${m}:${s} ${levels[i % levels.length]} worker-${
        i % 4
      } delivered change ${100000 + i} to 3 devices in ${20 + (i % 37)} ms\n`
    }).join(''),
  )

  // pictures and PDF: a new tab
  put('assets/logo.svg', LOGO)
  put('assets/spec-sheet.pdf', pdf('Sync service - spec sheet (demo)'))

  // a hidden folder: shown with "Show hidden files"
  put(
    '.drafts/ideas.md',
    '# Ideas (draft)\n\nA hidden folder: the folder page lists it with "Show hidden files".\n',
  )
}
