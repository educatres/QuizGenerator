# Provider compatibility

Teacher Exam Studio 是純前端 BYOK 應用程式。瀏覽器直接以 HTTPS 呼叫供應商；是否可用取決於 API 權限與供應商的 CORS 設定。

| Provider | Models | Generate | Key policy | Notes |
| --- | --- | --- | --- | --- |
| CGU LLM Gateway | `GET /models` | `POST /chat/completions` | Bearer；依 Provider 保存於瀏覽器 | 模型以下拉選單呈現；首次偵測預設最新 Luna；需允許 GitHub Pages 來源的 CORS |
| OpenAI | `GET /models` | `POST /chat/completions` | Bearer；依 Provider 保存於瀏覽器 | 瀏覽器直連政策可能依帳戶／端點而異 |
| xAI / Grok | `GET /language-models` | `POST /chat/completions` | Bearer；依 Provider 保存於瀏覽器 | 模型清單可見不等於具有生成權限 |
| Google Gemini | `GET /models` | `models/{id}:generateContent` | Query key；依 Provider 保存於瀏覽器 | 使用 JSON response MIME type |

錯誤提示會區分 401/403、429、5xx、無法連線與 CORS。因瀏覽器無法可靠地判別「斷線」和「CORS 阻擋」，兩者會顯示在同一類訊息中。

API Key 會保存在目前瀏覽器的 `localStorage`，不會匯出或同步至 GitHub。AI 設定中的「清除 API Key」只清除目前 Provider；頁首垃圾桶的「清除本機資料」會連同所有 Provider Key、題庫與教材索引一起清除。
