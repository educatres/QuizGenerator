# Teacher Exam Studio

Teacher Exam Studio 是依照 [`AI_Exam_Generator_PRD.md`](./AI_Exam_Generator_PRD.md) 實作的 browser-first 智慧出題與試卷製作工具。它可在瀏覽器本機解析 PDF、TXT 與 Markdown，以使用者自己的 API Key 呼叫 AI，再由教師審核並匯出 A4 試卷、互動測驗或 JSON 題庫。

## 隱私設計

- API Key 依 Provider 保存在使用者目前瀏覽器的 `localStorage`，不寫入 IndexedDB、匯出檔或 Git；請只在信任的個人裝置使用，並可從「AI 設定」一鍵清除。
- 教材先在瀏覽器解析。只有按下「產生候選題」時，文字片段才直接送往選定的 AI Provider。
- 匯出檔不包含 API Key、Provider metadata 或教材全文。
- 題庫與教材擷取文字會保存在本機 IndexedDB，方便重新開啟後繼續審核。

## 功能

1. 收合式 AI 設定按鈕；CGU LLM Gateway、OpenAI、xAI / Grok、Google Gemini Provider Adapter
2. CGU 模型自動偵測下拉選單，首次偵測預設選擇 API 回傳的最新 Luna
3. PDF.js Web Worker、CMap 與 standard fonts；TXT / Markdown / 貼上文字
4. 單選、複選、是非與簡答題；來源引文驗證
5. 題目編輯、接受／退回、複製、刪除、排序與版本紀錄
6. A4 題本＋解答、離線互動測驗與 JSON 備份
7. IndexedDB 自動保存、GitHub Pages 自動部署

## 本機開發

```bash
npm install
npm run dev
```

驗證：

```bash
npm test
npm run build
npm run test:e2e
```

Provider 與 CORS 注意事項請見 [`docs/provider-compatibility.md`](./docs/provider-compatibility.md)。掃描型 PDF 的 OCR、Word／圖片輸入與雲端題庫不在 MVP 範圍。

## GitHub Pages

推送至 `main` 後，`.github/workflows/deploy.yml` 會執行測試、建置並發布 `dist`。Repository 的 Pages Source 需設為 **GitHub Actions**。
