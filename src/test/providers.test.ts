import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelOption } from '../providers/types';

describe('provider preferences', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('persists and clears an API key in browser storage', async () => {
    const providers = await import('../providers');
    providers.setSessionKey('cgu', 'test-key-123');
    expect(providers.hasSessionKey('cgu')).toBe(true);
    expect(localStorage.getItem('teacher-exam-studio.api-keys.v1')).toContain('test-key-123');
    providers.clearSessionKey('cgu');
    expect(providers.hasSessionKey('cgu')).toBe(false);
    expect(localStorage.getItem('teacher-exam-studio.api-keys.v1')).toBeNull();
  });

  it('places the latest Luna model first for CGU', async () => {
    const { sortCguModels } = await import('../providers');
    const models: ModelOption[] = [
      { id: 'mistral-small', label: 'Mistral Small', created: 300 },
      { id: 'luna-2.4', label: 'Luna 2.4', created: 100 },
      { id: 'luna-3.1', label: 'Luna 3.1', created: 200 },
    ];
    expect(sortCguModels(models).map(model => model.id)).toEqual(['luna-3.1', 'luna-2.4', 'mistral-small']);
  });

  it('uses semantic Luna version when timestamps are absent', async () => {
    const { sortCguModels } = await import('../providers');
    expect(sortCguModels([{ id: 'luna-2.10', label: 'Luna 2.10' }, { id: 'luna-2.9', label: 'Luna 2.9' }])[0].id).toBe('luna-2.10');
  });

  it('uses max_completion_tokens for the CGU connection test', async () => {
    const providers = await import('../providers');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    providers.setSessionKey('cgu', 'test-key-123');
    await providers.adapters.cgu.testGeneration('luna-latest');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.max_completion_tokens).toBe(8);
    expect(request).not.toHaveProperty('max_tokens');
    vi.unstubAllGlobals();
  });

  it('does not override the default temperature when generating with CGU', async () => {
    const providers = await import('../providers');
    const generated = { questions: [{
      type: 'true_false', stem: '這是一個有效題目嗎？', correctBoolean: true,
      explanation: '是。', sources: [{ documentId: 'doc', chunkId: 'doc-c1', quote: '教材' }],
      difficulty: 'easy', points: 5,
    }] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(generated) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    providers.setSessionKey('cgu', 'test-key-123');
    await providers.adapters.cgu.generateQuestions({
      model: 'luna-latest',
      chunks: [{ id: 'doc-c1', documentId: 'doc', text: '教材' }],
      settings: { counts: { single: 0, multiple: 0, true_false: 1, short_answer: 0 }, difficulty: 'easy', points: 5, language: 'zh-TW', instructions: '' },
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).not.toHaveProperty('temperature');
    expect(request.response_format).toEqual({ type: 'json_object' });
    vi.unstubAllGlobals();
  });

  it('retries once with a format repair prompt after invalid model JSON', async () => {
    const providers = await import('../providers');
    const valid = { questions: [{
      type: 'true_false', stem: '這是一個有效題目嗎？', correctBoolean: true,
      explanation: '是。', sources: [{ documentId: 'doc', chunkId: 'doc-c1', quote: '教材' }],
      difficulty: 'easy', points: 5,
    }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [{ ...valid.questions[0], explanation: ['解析陣列'] }] }) } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    providers.setSessionKey('cgu', 'test-key-123');

    const result = await providers.adapters.cgu.generateQuestions({
      model: 'luna-latest',
      chunks: [{ id: 'doc-c1', documentId: 'doc', text: '教材' }],
      settings: { counts: { single: 0, multiple: 0, true_false: 1, short_answer: 0 }, difficulty: 'easy', points: 5, language: 'zh-TW', instructions: '' },
    });

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryRequest.messages[1].content).toContain('不要把字串包在陣列中');
    vi.unstubAllGlobals();
  });
});
