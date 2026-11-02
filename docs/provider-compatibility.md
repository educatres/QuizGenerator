# Provider compatibility

QuizGenerator 是純前端 BYOK 應用程式。瀏覽器直接以 HTTPS 呼叫供應商；是否可用取決於 API 權限與供應商的 CORS 設定。

| Provider | Models | Generate | Key policy | Notes |
| --- | --- | --- | --- | --- |
| CGU LLM Gateway | `GET /models` | Luna `POST /responses`; other models `POST /chat/completions` | Bearer token | Allowed models: `gemma-4-26b-a4b-it`, `gpt-oss:20b`, `gpt-oss-120b`; default `gpt-oss:20b` |
| OpenAI | `GET /models` | `POST /chat/completions` | Bearer；依 Provider 保存於瀏覽器 | 瀏覽器直連政策可能依帳戶／端點而異 |
| xAI / Grok | `GET /models` | `POST /chat/completions` | Bearer token | OpenAI-compatible endpoint |
| Google AI Studio | `GET /models` (Bearer) | Default `POST /chat/completions`; legacy `models/{id}:generateContent` | Bearer on OpenAI-compatible endpoint; query `key` on legacy endpoint | Default Base URL: `https://generativelanguage.googleapis.com/v1beta/openai` |

錯誤提示會區分 401/403、429、5xx、無法連線與 CORS。因瀏覽器無法可靠地判別「斷線」和「CORS 阻擋」，兩者會顯示在同一類訊息中。

API Key 會保存在目前瀏覽器的 `localStorage`，不會匯出或同步至 GitHub。AI 設定中的「清除 API Key」只清除目前 Provider；頁首垃圾桶的「清除本機資料」會連同所有 Provider Key、題庫與教材索引一起清除。
