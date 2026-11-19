# Chrome Web Store 上架資料

把下面各欄位的內容複製到 Chrome 開發者後台（Developer Dashboard）對應的欄位。
上傳的檔案：`dist/anyread-md-<版本>-store.zip`（用 `npx pnpm@9 run pack:store` 產生）。

---

## 1. Package（套件）

上傳 `dist/anyread-md-<版本>-store.zip`。這個 zip 的根目錄就是 `manifest.json`，
不要上傳給人手動安裝用的 `anyread-md-<版本>.zip`（那份多包了一層資料夾）。

---

## 2. Store listing（商店資訊）

### 預設語言：English

**Name**（從 manifest 自動帶入）

```
AnyRead MD
```

**Summary**（manifest 的 description，132 字元內，自動帶入）

```
Read, browse and edit Markdown files in Chrome. Folder view, diagrams and math; everything stays on your computer.
```

**Description**

```
AnyRead MD turns Markdown files into clean, readable pages right in Chrome, and lets you browse and edit them without leaving the browser. It is free, needs no account and never sends your files anywhere.

READ
• Open local .md / .markdown files (file://)
• Optional: also show Markdown files on web sites you allow (one site or all sites)
• Light and dark themes, syntax-highlighted code, click-to-zoom images
• Outline side bar to jump between headings
• Auto refresh: the page updates when you save the file in your editor
• Links to other Markdown files open in a pane on the right, next to what you are reading; drag the divider to resize it, go back and forward, or open the file in this tab or a new one
• CSV and Excel (.xlsx) files show as tables, in the pane or on a table page with a Download button (Chrome would only download them)
• .txt files, code files and Mermaid diagrams (.mmd) open in the pane too
• Font size, text width, line height and your own CSS
• Export to PDF (print) or to a single HTML file

BROWSE A WHOLE FOLDER
• Drag a folder into a normal tab to browse it: a file tree on the left, the file you pick on the right, the folder's README first
• Type to filter, ↑ ↓ to select, Enter to open
• Search inside the files of the folder
• "Files" tab in the side bar to switch between documents in the same folder

EDIT
• Alt+Shift+E opens a split editor with live preview
• Ctrl+S saves back to the file you choose
• Formatting buttons and shortcuts; paste a picture to save it next to the document

RICH MARKDOWN
• Mermaid diagrams (flowchart, sequence, class, state, Gantt and more)
• KaTeX math, footnotes, task lists, callout boxes, emoji, tables with merged cells, YAML front matter
• Turn each plugin on or off and fine-tune its options in Settings
• .txt files are laid out as Markdown, keeping their line breaks
• Open other text files you choose (e.g. .c, .py) as highlighted code
• Mermaid files (.mmd) are drawn as a diagram

PRIVATE BY DESIGN
• No account, no ads, no analytics, no tracking
• No servers: everything is rendered inside your browser
• Settings are stored only on your device; save them to a file and restore them on another computer
• No access to web sites after install; you turn it on yourself if you want it

SETUP
To open local files, go to the extension's Details page and turn on "Allow access to file URLs". The welcome page after install walks you through it.

Open source, based on md-reader 2.x (MIT License). Source code: https://github.com/kuotungtsai/AnyRead-MD
```

**Category**：`Developer Tools`

**Language**：English

**Graphic assets**

- Store icon（128×128）：`store/store-icon-128.png`（96×96 圖案加 16px 透明邊，符合商店規範）
- Screenshots（1280×800，依序上傳，商店最多 5 張）：`store/screenshots/1-split-view.png`、`2-tables.png`、`3-folder-view.png`、`4-edit-mode.png`、`5-dark-math-diagrams.png`
- Small promo tile（440×280）：`store/promo-440x280.png`

**Additional fields**

- Official URL：（可留空）
- Homepage URL：`https://github.com/kuotungtsai/AnyRead-MD`
- Support URL：`https://github.com/kuotungtsai/AnyRead-MD/issues`

### 選填：新增「中文（繁體）」語言

在 Store listing 右上角的語言選單新增 Chinese (Traditional)，貼上：

```
AnyRead MD 讓 Markdown 檔案在 Chrome 裡直接變成乾淨好讀的頁面，還能瀏覽整個資料夾、直接編輯。完全免費、不需要帳號，檔案也不會傳到任何地方。

閱讀
• 開啟本機的 .md / .markdown 檔（file://）
• 選用：你允許的網站上的 Markdown 檔也能顯示（單一網站或所有網站）
• 淺色 / 深色主題、程式碼上色、點圖片可放大
• 側邊欄大綱，點標題就跳過去
• 自動刷新：在編輯器存檔後，頁面自動更新
• 連到其他 Markdown 檔的連結會在右半邊開啟，原本的文件留在左邊；可拖曳中間的分隔線調整寬度、回上一個 / 下一個，或改在這個分頁、新分頁開啟
• CSV 和 Excel（.xlsx）檔顯示成表格，在右半邊或表格頁打開，表格頁有「下載」按鈕（Chrome 原本只會直接下載）
• .txt、程式碼檔和 Mermaid 圖（.mmd）也能在右半邊打開
• 可調整字體大小、內容寬度、行距，也能加自己的 CSS
• 匯出成 PDF（列印）或單一 HTML 檔

瀏覽整個資料夾
• 把資料夾拖進一般分頁就能瀏覽：左邊檔案樹，右邊顯示點的檔案，有 README 會先顯示
• 打字篩選、↑ ↓ 選擇、Enter 開啟
• 可搜尋資料夾裡所有檔案的內容
• 側邊欄「檔案」分頁，切換同資料夾的其他文件

編輯
• Alt+Shift+E 開啟左右分割編輯器，右邊即時預覽
• Ctrl+S 存回你選擇的檔案
• 格式工具列與快捷鍵；貼上圖片會存在文件旁邊

豐富的 Markdown
• Mermaid 圖表（流程圖、循序圖、類別圖、狀態圖、甘特圖等）
• KaTeX 數學公式、註腳、核取清單、提示框、Emoji、合併儲存格表格、YAML 前置資料
• 每個插件都能個別開關，並在設定頁調整參數
• .txt 檔用 Markdown 排版，保留原本的換行
• 自選其他文字檔（例如 .c、.py）以程式碼上色顯示
• Mermaid 圖檔（.mmd）直接畫成圖

重視隱私
• 沒有帳號、沒有廣告、沒有分析、不追蹤
• 不連任何伺服器，全部在瀏覽器裡處理
• 設定只存在你的裝置上；可以存成檔案，換電腦時再還原
• 安裝後沒有任何網站的存取權，需要時由你自己開啟

使用前設定
要開啟本機檔案，請到擴充功能的「詳細資料」開啟「允許存取檔案網址」。安裝後的歡迎頁會一步步帶你設定。

開源專案，基於 md-reader 2.x（MIT 授權）修改。原始碼：https://github.com/kuotungtsai/AnyRead-MD
```

---

## 3. Privacy practices（隱私權實務）

**Single purpose**

```
Display Markdown files as formatted pages in the browser, and let the user browse the Markdown files in a local folder and edit them.
```

**Permission justification**

- `storage`

  ```
  Saves the user's settings (theme, enabled plugins, layout, extra file types) in chrome.storage.local on the user's device.
  ```

- `scripting`

  ```
  Registers the content script for extra file extensions the user adds in Settings (for example .c or .py) so those files are shown as highlighted code. Uses chrome.scripting.registerContentScripts only for the extensions the user chose.
  ```

- `activeTab`

  ```
  When the user clicks the toolbar icon, the popup reads the address of the current tab to see whether it is a Markdown file on a site that is not allowed yet, and then offers a button to turn the extension on for that site.
  ```

- Host permission（`file:///*`）

  ```
  Needed to detect and render local Markdown files the user opens, to read the browser's own file:// folder listing for the folder view and search, to read a linked Markdown, CSV, Excel, text or Mermaid file, or a picture next to the document (preview, table page and export), and to re-read the open file for auto refresh. The user must also turn on "Allow access to file URLs".
  ```

- Optional host permission（`*://*/*`，1.1.0 起改成選用）

  ```
  Off after install. The user can grant it for one site (popup) or for all sites (settings) to render Markdown files opened on web sites. Without it the extension does not run on any web page.
  ```

**Are you using remote code?**：`No, I am not using remote code`

```
All JavaScript is bundled in the package. No code is loaded from any server.
```

**Data usage**

- 「What user data do you plan to collect?」：全部**不要勾**（不收集任何類型的資料）。
- 下面三個聲明全部**勾選**：
  - I do not sell or transfer user data to third parties, outside of the approved use cases
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose
  - I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/kuotungtsai/AnyRead-MD/blob/main/PRIVACY.md
```

---

## 4. Distribution（發布）

- Payments：`Free of charge`
- Visibility：`Public`（任何人搜尋得到）或 `Unlisted`（只有拿到連結的人能安裝）
- Regions：`All regions`

---

## 5. 審核注意事項

- 1.0.x 因為要求「所有網站」的存取權，審核可能需要幾天到一週以上；1.1.0 起這項改成選用權限，安裝時不再要求。
- 審核期間不要一直重新提交；被退件時，信裡會寫原因，照著改再送即可。
- 之後更新：改 `package.json` 版本 → `npx pnpm@9 run pack:store` → 在後台 Package 頁上傳新 zip。
  版本號一定要比上一次大。
