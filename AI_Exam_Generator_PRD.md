# AI 智慧出題與試卷製作系統 — Codex 開發規格（v1.0）

> 產品代號：Teacher Exam Studio  
> 目標部署：GitHub Pages 靜態網站  
> 主要語言：繁體中文（zh-TW）  
> 核心原則：Browser-first、BYOK（Bring Your Own Key）、老師審核後才能定稿  
> 日期：2026-10-27

## 1. 產品目標

讓老師在自己的瀏覽器中，透過上傳 PDF / TXT / Markdown 教材，使用自己提供的 CGU、OpenAI、xAI（Grok）或 Google AI Studio（Gemini）API Key，產生考試題目；逐題採用、拒絕、編輯或重出題；最後匯出可列印的 A4 HTML 試卷，或可下載、離線作答的獨立互動 HTML。

**不需要老師註冊本網站帳號，不建置應用伺服器，不將教材傳送到本網站的儲存服務。** 教材文字仍會依老師明確選擇，傳送至所選模型供應商產生題目；UI 必須事先清楚告知這件事。

### 核心產品判斷

- 網站主程式可完全由 GitHub Pages 託管。
- PDF 文字抽取、教材分段、題庫管理、出題審核、匯出都在瀏覽器執行。
- 外部 AI 呼叫能否純瀏覽器直連，受 **CORS、供應商 API 政策、API Key 安全規範** 限制，不可在驗證前承諾四家都可用。
- 開發順序先執行「四家 Provider 的實際 GitHub Pages 瀏覽器連線驗證」；不允許以 `no-cors`、公開 CORS 代理、停用瀏覽器安全限制、將 Key 放入 URL 或自行上傳 Key 到他人伺服器來繞過。
- 純前端直接使用老師自帶 Key 是權衡後的產品模式，不等於零風險。Key 僅暫存在執行期間的記憶體，不寫入 localStorage、IndexedDB、Cookie、網址、日誌、匯出檔與 Git。

## 2. 使用者流程

1. **連線設定**：選供應商 → 貼入自己的 Key →「測試連線」→ 讀取可用模型 → 選模型。
2. **教材輸入**：拖拉或選擇一份或多份 PDF、.txt、.md，也可直接貼文字 → 顯示檔案名稱、頁數、字數、解析狀態及文字預覽 → 勾選要用的文件/頁面或段落。
3. **出題設定**：指定題數（單選、多選、是非、簡答/申論）、難度比例、適用年級、科目、語言、主題、每題分數、可選的出題指示。
4. **產生候選題**：AI 分批出題；題目需附標準答案、解說及教材依據（檔名、頁碼或文字段落）。
5. **老師審題**：可逐題「採用」「拒絕」「重新出題」「編輯」；批次採用；可依題型、難度、狀態篩選及調整順序。已採用題目不會被下一次生成覆寫。
6. **試卷組裝**：從已採用題目中設定考卷標題、考試時間、總分、班級/姓名/座號欄位、是否顯示配分、題目與選項順序；列印前預覽。
7. **匯出**：下載 (a) A4 題本 HTML、(b) 教師解答 HTML、(c) 學生互動測驗 HTML；支援儲存/匯入工程 JSON，供下次接續編輯。

## 3. 功能範圍：MVP 必做

### 3.1 API 設定

| Provider | 預設 Base URL | 模型列舉 | 出題路由（MVP 候選） |
| --- | --- | --- | --- |
| CGU LLM Gateway | `https://air.cgu.edu.tw/cgullmapi/v1` | `GET /models` | `POST /chat/completions`；不支援的模型另試 `/responses` |
| OpenAI | `https://api.openai.com/v1` | `GET /models` | `POST /chat/completions`；逐模型辨識需用 `/responses` 者 |
| xAI / Grok | `https://api.x.ai/v1` | `GET /models` 或 `GET /language-models` | `POST /chat/completions`（兼容但屬舊式介面；保留 `/responses` 擴充能力） |
| Google AI Studio / Gemini | `https://generativelanguage.googleapis.com/v1beta` | `GET /models`，過濾具文字生成能力的模型 | 原生 `models/{id}:generateContent`；亦可評估 OpenAI 相容 API `.../v1beta/openai/` |

- 每家有獨立 `ProviderAdapter`，內含 `listModels`、`testGeneration`、`generateQuestions`、`normalizeError`。不得以一段散落全專案的 `fetch` 處理所有供應商。
- **兩階段連線測試**：先檢查認證及模型列舉；再對所選模型發送極短的實際生成請求。第一階段成功不代表模型可出題。
- 模型下拉清單呈現 API 真正回傳的 ID；去除明顯非文字生成模型；不憑名稱假設所有模型支援相同參數。保留「進階：自行輸入模型 ID」選項。
- 模型清單失敗但生成可能可用時，保留手動輸入選項；UI 必須清楚區分「模型清單失敗」與「生成成功」。
- 明確顯示 401/403（權限）、404（模型/路由）、429（額度/頻率）、5xx（服務端）、超時及可能的 CORS/網路錯誤。CORS 預檢失敗有時無法由 JavaScript 精確區分，避免誤報為 Key 錯誤。
- 使用可取消的請求與顯示狀態；取消不保證供應商不計費。
- 不自動重試會增加費用的生成請求；如有重試需告知用戶。顯示每批教材字數、預估請求數，超過設定門檻需確認。

### 3.2 教材解析

- 支援 PDF、UTF-8 TXT、Markdown 與直接貼文字（Markdown 當一般文字處理即可）。
- 使用 `pdfjs-dist` 在瀏覽器取出 PDF 文字，每段保留 `documentId`、檔名、`pageNumber`、`chunkId`、原文摘要或引句。
- 顯示無法擷取文字的掃描 PDF 提示：MVP 不保證 OCR；可提示老師改用文字版。OCR（Tesseract.js）列入第二階段。
- 長教材依長度/頁面切片，保留一定重疊，防止題目失去上下文；讓老師自行選擇教材範圍及出題範圍。
- 不需要在第一版實作 RAG 向量資料庫；採用有來源標記的分段與分批生成已足夠。避免超出模型上下文長度。
- 上傳教材視為不可信參考內容，不執行其中命令；提示詞明確區分系統規則與教材內容，拒絕教材內的 prompt injection。

### 3.3 題型與 AI 出題

| 題型 | 必填內容 | 校驗規則 |
| --- | --- | --- |
| 單選題 | 題幹、4 個選項、1 個正解、解析 | 不得有多個正解；選項不能重複 |
| 多選題 | 題幹、4～6 個選項、至少 2 個正解、解析 | 正解集合必須落在選項內 |
| 是非題 | 敘述、true/false 正解、解析 | 答案必須為布林值 |
| 簡答／問答題 | 題目、參考答案、評分規準、解析 | 評分規準需可供老師修改 |

每題至少還要有：唯一 ID、難度、分數、來源引用、狀態（候選／採用／拒絕）、模型與產生時間、編輯版本。

- AI 輸出必須是結構化 JSON；使用 Zod 等 schema 在前端驗證。解析錯誤可顯示「再試一次」或針對原回傳做有限的格式修復；絕不讓損壞資料進入題庫。
- Prompt 要求：**只依指定教材出題**；答案可從來源找到依據；不清楚則不要出；出題避免重複、歧義、非唯一正解、洩題的選項、錯誤引用。
- 提供教師設定：題數、題型、科目、年級、難度、教學目標或 Bloom 層次（可選）、語言、每題配分、補充指令。
- 題目生成採小批次；允許部分成功、逐批顯示進度。生成題目數不足時顯示實際數量，不捏造補足。
- 每題可單獨重新生成；要把該題來源片段、題型、設定和避免重複的資訊送給 AI，而非重做整份題庫。
- 來源引用顯示為可點選的文件/頁碼；對無頁碼文字顯示段落或原文引句。引用的片段必須能與本地教材對上，否則標示「來源待確認」。
- 加入基礎去重（正規化題幹相似度），及嚴格格式驗證；不要宣稱能完全防止 AI 幻覺。題目以老師最後審核為準。

### 3.4 題庫審核與儲存

- 題卡顯示題幹、選項、答案、解析、來源、難度、狀態；老師可展開/收合解答。
- 按鈕：採用、拒絕、重新產生、編輯、複製、刪除。提供採用題目排序、題型篩選、題數/總分統計。
- 本機使用 IndexedDB 保存專案與題庫，建議使用 Dexie 封裝；**API Key 永不寫入**。提供「下載專案 JSON」與「匯入專案 JSON」備份/還原。
- 預設不跨裝置同步；清除瀏覽器資料可能失去本機專案，因此明確提醒定期備份。
- 未選擇採用的候選題不得進入最後試卷。

### 3.5 兩類 HTML 匯出

**A. 可列印 A4 HTML**

- 獨立 HTML（內嵌 CSS、資料；不依賴 CDN，不需要 API Key），開啟即可列印或透過瀏覽器另存 PDF。
- `@page { size: A4; margin: 15mm; }` 為基準；清楚的試卷抬頭、考試資訊、姓名/班級/座號、題型分區、配分、作答空間，適合繁體中文排版。
- 控制題幹與選項避免被頁面分割；對長題與申論題採合理的分頁策略。
- 分別輸出 **學生題本**（不能顯示答案）與 **教師解答本**（含正解、解析與來源）。
- 可選是否亂數排列題目/選項；排列需同步更新教師解答，避免索引錯亂。重現亂數使用保存的 seed。

**B. 獨立互動 HTML**

- 下載單一 `.html`，沒有外部 JS/CSS、API 呼叫與上傳；學生離線開啟可作答。
- 單選用 radio、多選用 checkbox、是非題 radio、問答題 textarea；有題目導覽、進度、提交確認。
- 提交後自動批改單選／多選／是非，並顯示結果與解析；問答題只提供參考答案/評分規準供自評，**不宣稱自動客觀評分**。
- 可選「下載我的作答結果 JSON / 列印作答記錄」；不建立伺服器端成績收集或教師儀表板。
- **重要限制**：離線 HTML 必須包含答案才能自動批改；懂得查看原始碼的學生可能事先找到答案。因此定位為「練習／形成性測驗」，不適合防作弊的正式高風險考試。
- HTML 匯出必須對所有老師輸入、模型輸出做安全文字編碼，防止 HTML/script 注入；不能把 API Key 或完整教師工程檔嵌入學生試卷。

## 4. 建議技術架構

| 層次 | 選型 |
| --- | --- |
| UI | React + TypeScript + Vite |
| 樣式 | Tailwind CSS 或 CSS Modules，桌面優先、平板可操作 |
| 狀態 | Zustand（或 React state + Context；不必複雜化） |
| 表單/結構驗證 | React Hook Form（可選）、Zod |
| PDF 解析 | `pdfjs-dist`；Web Worker 同源打包 |
| 本機資料 | IndexedDB + Dexie（Key 保持記憶體） |
| API 層 | `ProviderAdapter` + `fetch`；各 Provider 獨立 serializer/parser |
| HTML 匯出 | 純 TypeScript 字串模板 + escape/sanitize + Blob 下載；獨立 CSS/JS 內嵌 |
| 部署 | GitHub Actions build → GitHub Pages；Vite `base` 支援 repo 子路徑 |
| 測試 | Vitest + Testing Library + Playwright |

推薦專案結構：

```text
src/
  app/
  components/
  features/
    connection/
    materials/
    generation/
    review/
    export/
  providers/
    types.ts
    cgu.ts
    openai.ts
    xai.ts
    gemini.ts
  domain/
    questionSchema.ts
    examSchema.ts
    validation.ts
  services/
    pdfExtract.ts
    chunker.ts
    prompts.ts
    localDb.ts
    exportPrintHtml.ts
    exportInteractiveHtml.ts
  test/
.github/workflows/deploy.yml
```

資料型別草案：

```ts
type QuestionType = 'single' | 'multiple' | 'true_false' | 'short_answer';
type QuestionStatus = 'candidate' | 'accepted' | 'rejected';

interface Question {
  id: string;
  type: QuestionType;
  stem: string;
  options?: Array<{ id: string; text: string }>;
  correctOptionIds?: string[];
  correctBoolean?: boolean;
  referenceAnswer?: string;
  rubric?: string;
  explanation: string;
  sources: Array<{
    documentId: string;
    chunkId: string;
    pageNumber?: number;
    quote: string;
  }>;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
  status: QuestionStatus;
  revision: number;
  providerId: 'cgu' | 'openai' | 'xai' | 'gemini';
  modelId: string;
  createdAt: string;
}
```

## 5. 頁面與導覽

採用 5 步驟導引（Stepper）及工作進度保存：

1. **AI 設定**：Provider 卡片、密碼遮蔽 Key 輸入、測試狀態、模型下拉、重置連線。
2. **上傳教材**：拖拉上傳/貼文字、文件清單、頁面/文字預覽、選取出題範圍。
3. **產生題目**：題型數量調整、難度及科目選擇、請求/費用提醒、批次生成進度。
4. **審核題庫**：左側篩選、中央題卡、右側已採用題數/總分統計；單題重新生成及手動編輯。
5. **匯出試卷**：試卷設定、A4 預覽、學生題本/教師解答/互動版下載、工程 JSON 備份。

所有核心操作都應有 loading、empty、error、retry、success 狀態；使用繁體中文，鍵盤可操作，符合基本對比及標籤可及性要求。

## 6. 隱私、安全、授權邊界

1. 老師貼 Key 前顯示：「此 Key 將由本頁面直接發送到所選 AI 供應商；請只在您信任的網站使用，並確認該 Provider 允許此用法。」
2. Key 使用 `type=password`，只保留 React 的記憶體 state / closure（頁面重整需重貼）；不呼叫任何第三方分析服務。
3. 不將 Key 放在 `console.log`、錯誤回報、localStorage、IndexedDB、網址參數、生成的 HTML/JSON 或網路請求以外的外送服務。
4. 所有 API 統一 HTTPS；Base URL 建議在正式版本固定白名單，除非開啟進階模式並明確提醒風險。
5. 在傳送教材前顯示明確確認及選取範圍；提醒涉及學生成績、個資、機密教案時應先去識別化並遵循校內規範。
6. 防範 XSS：題幹、選項、解析及教材內容全部視為不可信資料，使用安全 DOM API / encoding 顯示；匯出 HTML 也要經過同樣處理。
7. 為官方預設網址建立 Content Security Policy（在 GitHub Pages 靜態限制下採 HTML meta CSP 規劃）與最小依賴；不要使用會將 Key 傳到非 Provider 網域的套件。
8. **無法證實 CGU 的 CORS 行為**：必須以正式部署網址和自己授權的測試 Key 實測；若 CGU 不允許該來源，不可宣稱無後端能支援 CGU。可另列「可選的、受學校管理的微型代理」為架構變更提案，但**未取得教師或管理者同意前不實作**。

## 7. 開發里程碑（照此順序交給 Codex）

### Phase 0 — API 可行性 Spike（必須先過）

- 建立最小 Vite + React 網頁部署到 GitHub Pages 測試路徑。
- 在部署後的實際瀏覽器中，使用測試 Key 實測四家：GET models、POST 最短生成；記錄 HTTP、CORS、錯誤訊息、延遲，以及可用模型。
- 產生 `docs/provider-compatibility.md`：一張四家 `models / generate / key policy / notes` 矩陣；對失敗項列出可重現步驟。
- **Gate**：若關鍵 Provider（特別 CGU）直連失敗，停在架構決策，不要透過 CORS 繞路工具假裝完成。

### Phase 1 — 靜態 UI + 教材解析

- 建好 5 步驟 UI，PDF/TXT/MD/貼文字輸入、文字預覽與章節/頁面標記。
- 完成 localDB 與 JSON 專案備份；測試多文件、無文字 PDF、檔案過大及特殊字元。

### Phase 2 — Provider Adapter + AI 生成

- 各 Provider 模型列表、Key 測試、模型選擇、錯誤/中止與一次小批次出題。
- Zod 題目 JSON 驗證、失敗處理、來源標記、基本去重。
- 所有測試用 Mock API，不放任何真實 Key 到 CI / GitHub。

### Phase 3 — 老師審核題庫

- 題卡、採用/拒絕/編輯/單題重出/排序/統計。
- 確保修改後的題目仍符合 schema；被採用題目持久化，重整頁面恢復。

### Phase 4 — HTML 匯出與列印

- A4 試卷、教師解答、單一檔案互動 HTML，含題型評分與結果匯出。
- 印出 A4 真實預覽，測試 Windows Chrome / Edge；長題不裁切、沒有超出頁邊。
- 驗證學生版沒有 Key、教師完整工程資料及不應外露的來源全文。

### Phase 5 — 完整測試與上線

- Vitest 單元測試、Playwright 主流程 E2E、GitHub Actions 自動部署、README 操作指南。
- 驗證 `https://<owner>.github.io/<repo>/` 路徑下正常載入 PDF Worker、圖示及匯出功能。
- 完成 Provider 真實 API 矩陣，將尚未支援的 Provider / 模型精確顯示在 UI 與 README。

## 8. 驗收條件（Definition of Done）

- [ ] GitHub Pages 不需 server，老師能直接使用網站。
- [ ] 在有正式瀏覽器實測紀錄的 Provider 上，Key → 測試 → 模型清單 → 生成成功；其餘 Provider 清楚標示限制。
- [ ] 可上傳 PDF/TXT/MD 或貼上文字，文字預覽與來源頁碼可追溯。
- [ ] 四種題型皆有格式驗證及答案/解析；AI 缺失資訊有明確錯誤處理。
- [ ] 採用/拒絕/重出/編輯不覆寫其他已採用題目，且老師只匯出採用題。
- [ ] 匯出學生 A4 HTML、教師解答 A4 HTML、獨立互動 HTML 都能離線開啟。
- [ ] 單/多選/是非的互動評分正確；問答題不自動評分；重排選項後解答仍正確。
- [ ] A4 於 Chrome / Edge 列印不超出版面；題目與選項不被任意截斷。
- [ ] Key 不存入持久化、日誌、專案 JSON 或試卷；所有使用者/AI 文字安全逸出。
- [ ] 專案可匯出 JSON、重新匯入並恢復題庫；沒有第三方帳號或網站資料庫。
- [ ] 具備足夠的單元、整合與 E2E 測試；沒有真實 Key 進入 git history。

## 9. MVP 暫不做（避免 Codex 過度開發）

- 登入、跨裝置同步、雲端教師題庫、雲端成績管理、學生成績收集。
- 正式線上防作弊監考與考試權限管控。
- 學生問答題 AI 自動批改。
- OCR 掃描型 PDF（列後續迭代）、音訊/圖片/Word、數學公式完美還原。
- 向量 DB / RAG 平台、付費系統、後端或任何未經確認的代理。

## 10. 可直接貼給 Codex 的總指令

> 請依本 `AI_Exam_Generator_PRD.md` 開發一個 GitHub Pages 可部署的 Browser-first React + TypeScript + Vite 專案。請嚴格遵循 Phase 0→5 的順序。第一階段先建立最小部署與可測試四家 Provider 的小工具，驗證模型列舉與實際生成能否由正式 GitHub Pages 網域在瀏覽器直連；不要假設 CGU 或其他服務支持 CORS。若連線受阻，寫入相容性報告並停下來請我做架構選擇，不要自行導入代理伺服器。所有 API Keys 由使用者貼入，只存記憶體，絕不可寫入 git / localStorage / IndexedDB / log / 匯出檔。後續實作 PDF/TXT/Markdown 本地解析、依教材來源出四類題目、逐題審核及重出、IndexedDB 題庫保存、JSON 備份、A4 題本/教師解答 HTML 與獨立互動 HTML。使用 ProviderAdapter 和 Zod schema，所有出題內容都需老師審核。請以繁體中文設計介面，加入 Vitest/Playwright 測試並設定 GitHub Actions 部署。每階段回報完成內容、測試證據、未解決風險，再進下一階段；不要虛構實際 API 測試結果。

## 11. 官方參考

- CGU LLM Gateway：https://air.cgu.edu.tw/workspace4/LLMAPI/api_call.html
- OpenAI API Overview：https://developers.openai.com/api/reference/overview
- Google Gemini Models API：https://ai.google.dev/api/models
- Google Gemini API Key 安全：https://ai.google.dev/gemini-api/docs/api-key
- Google OpenAI 相容介面：https://ai.google.dev/gemini-api/docs/openai/
- xAI Models API：https://docs.x.ai/developers/rest-api-reference/inference/models
- xAI Inference API：https://docs.x.ai/developers/rest-api-reference/inference

