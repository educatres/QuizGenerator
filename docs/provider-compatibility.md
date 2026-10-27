# Provider compatibility

Teacher Exam Studio 是純前端 BYOK 應用程式。瀏覽器直接以 HTTPS 呼叫供應商；是否可用取決於 API 權限與供應商的 CORS 設定。

| Provider | Models | Generate | Key policy | Notes |
| --- | --- | --- | --- | --- |
| CGU LLM Gateway | `GET /models` | `POST /chat/completions` | Bearer；只存在分頁記憶體 | 預設選項；需由 CGU 允許 GitHub Pages 來源的 CORS |
| OpenAI | `GET /models` | `POST /chat/completions` | Bearer；只存在分頁記憶體 | 瀏覽器直連政策可能依帳戶／端點而異 |
| xAI / Grok | `GET /language-models` | `POST /chat/completions` | Bearer；只存在分頁記憶體 | 模型清單可見不等於具有生成權限 |
| Google Gemini | `GET /models` | `models/{id}:generateContent` | Query key；只存在分頁記憶體 | 使用 JSON response MIME type |

錯誤提示會區分 401/403、429、5xx、無法連線與 CORS。因瀏覽器無法可靠地判別「斷線」和「CORS 阻擋」，兩者會顯示在同一類訊息中。
