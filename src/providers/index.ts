import { generatedResponseSchema, extractJson, type GeneratedQuestion } from '../domain/questionSchema';
import type { ProviderId } from '../domain/types';
import { selectGenerationContext } from '../services/chunker';
import { buildQuestionPrompt, systemGuard } from '../services/prompts';
import type { GenerateRequest, ModelOption, ProviderAdapter } from './types';

const sessionKeys = new Map<ProviderId, string>();
export function setSessionKey(provider: ProviderId, key: string) {
  const cleaned = key.trim().replace(/^Authorization:\s*/i, '').replace(/^Bearer\s+/i, '');
  if (cleaned && !/^[\x21-\x7e]+$/.test(cleaned)) throw new Error('API Key 格式不正確，請勿包含空白或其他文字。');
  if (cleaned) sessionKeys.set(provider, cleaned); else sessionKeys.delete(provider);
}
export const hasSessionKey = (provider: ProviderId) => sessionKeys.has(provider);
export const clearSessionKey = (provider: ProviderId) => sessionKeys.delete(provider);
export const clearAllSessionKeys = () => sessionKeys.clear();
window.addEventListener('pagehide', clearAllSessionKeys);

const config = {
  cgu: { name: 'CGU LLM Gateway', baseUrl: 'https://air.cgu.edu.tw/cgullmapi/v1', keyUrl: 'https://air.cgu.edu.tw/workspace4/LLMAPI/index.php' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  xai: { name: 'xAI / Grok', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai/' },
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyUrl: 'https://aistudio.google.com/api-keys' },
} satisfies Record<ProviderId, { name: string; baseUrl: string; keyUrl: string }>;

function getKey(id: ProviderId) {
  const key = sessionKeys.get(id);
  if (!key) throw new Error(`請先輸入 ${config[id].name} API Key。`);
  return key;
}

function normalizeError(error: unknown, provider: ProviderId) {
  if (error instanceof DOMException && error.name === 'AbortError') return new Error('已取消產生題目。');
  if (error instanceof TypeError) return new Error(`瀏覽器無法連到 ${config[provider].name}。請檢查網路或該服務的 CORS 設定。`);
  return error instanceof Error ? error : new Error('發生未知錯誤。');
}

async function fetchJson(provider: ProviderId, path: string, init: RequestInit = {}) {
  const key = getKey(provider);
  const url = provider === 'gemini' ? `${config[provider].baseUrl}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : `${config[provider].baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(provider === 'gemini' ? {} : { Authorization: `Bearer ${key}` }), ...init.headers } });
  } catch (error) { throw normalizeError(error, provider); }
  if (!response.ok) {
    let detail = '';
    try { const data = await response.json(); detail = data.error?.message || data.message || ''; } catch { /* response was not JSON */ }
    const hint = response.status === 401 || response.status === 403 ? 'API Key 無效或沒有權限。' : response.status === 429 ? '已達速率或額度限制，請稍後重試。' : response.status >= 500 ? '供應商暫時無法服務。' : detail;
    throw new Error(`${config[provider].name} 回應 ${response.status}：${hint || '請求失敗。'}`);
  }
  try { return await response.json(); } catch { throw new Error('供應商沒有回傳有效 JSON。'); }
}

function validateQuestions(raw: string): GeneratedQuestion[] {
  const parsed = generatedResponseSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new Error(`題目格式驗證失敗：${parsed.error.issues[0]?.message ?? '未知格式錯誤'}`);
  return parsed.data.questions;
}

function createAdapter(id: ProviderId): ProviderAdapter {
  const info = config[id];
  return {
    id, ...info,
    async listModels(): Promise<ModelOption[]> {
      if (id === 'gemini') {
        const data = await fetchJson(id, '/models?pageSize=100');
        return (data.models ?? []).filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent')).map((m: { name: string; displayName?: string }) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
      }
      const data = await fetchJson(id, id === 'xai' ? '/language-models' : '/models');
      const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
      return list.map((m: { id: string; name?: string }) => ({ id: m.id, label: m.name || m.id })).filter((m: ModelOption) => m.id).sort((a: ModelOption, b: ModelOption) => a.id.localeCompare(b.id));
    },
    async testGeneration(model: string) {
      if (!model.trim()) throw new Error('請先選擇模型。');
      if (id === 'gemini') {
        await fetchJson(id, `/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: '只回覆 OK' }] }] }) });
      } else {
        await fetchJson(id, '/chat/completions', { method: 'POST', body: JSON.stringify({ model, messages: [{ role: 'user', content: '只回覆 OK' }], max_tokens: 8 }) });
      }
    },
    async generateQuestions(request: GenerateRequest) {
      const prompt = buildQuestionPrompt(request.settings, selectGenerationContext(request.chunks));
      let text = '';
      try {
        if (id === 'gemini') {
          const data = await fetchJson(id, `/models/${encodeURIComponent(request.model)}:generateContent`, { method: 'POST', signal: request.signal, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemGuard }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } }) });
          text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text || '').join('');
        } else {
          const data = await fetchJson(id, '/chat/completions', { method: 'POST', signal: request.signal, body: JSON.stringify({ model: request.model, messages: [{ role: 'system', content: systemGuard }, { role: 'user', content: prompt }], temperature: 0.3, response_format: { type: 'json_object' } }) });
          text = data.choices?.[0]?.message?.content || '';
        }
      } catch (error) { throw normalizeError(error, id); }
      return validateQuestions(text);
    },
  };
}

export const adapters: Record<ProviderId, ProviderAdapter> = {
  cgu: createAdapter('cgu'), openai: createAdapter('openai'), xai: createAdapter('xai'), gemini: createAdapter('gemini'),
};
