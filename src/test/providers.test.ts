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

  it('limits CGU models to the supported model allowlist in display order', async () => {
    const { filterCguModels } = await import('../providers');
    expect(filterCguModels([
      { id: 'gpt-oss-120b', label: 'GPT OSS 120B' },
      { id: 'other-model', label: 'Other model' },
      { id: 'gpt-oss:20b', label: 'GPT OSS 20B' },
      { id: 'gemma-4-26b-a4b-it', label: 'Gemma 4' },
    ])).toEqual([
      { id: 'gemma-4-26b-a4b-it', label: 'gemma-4-26b-a4b-it' },
      { id: 'gpt-oss:20b', label: 'gpt-oss:20b' },
      { id: 'gpt-oss-120b', label: 'gpt-oss-120b' },
    ]);
  });

  it('uses the Responses API for a CGU Luna connection test', async () => {
    const providers = await import('../providers');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    providers.setSessionKey('cgu', 'test-key-123');
    await providers.adapters.cgu.testGeneration('luna-latest');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock.mock.calls[0][0]).toContain('/responses');
    expect(request.max_output_tokens).toBe(4096);
    expect(request.reasoning).toEqual({ effort: 'medium' });
    vi.unstubAllGlobals();
  });

  it('uses the Responses API without a temperature for CGU Luna generation', async () => {
    const providers = await import('../providers');
    const generated = { questions: [{
      type: 'true_false', stem: '這是一個有效題目嗎？', correctBoolean: true,
      explanation: '是。', sources: [{ documentId: 'doc', chunkId: 'doc-c1', quote: '教材' }],
      difficulty: 'easy', points: 5,
    }] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(generated) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    providers.setSessionKey('cgu', 'test-key-123');
    await providers.adapters.cgu.generateQuestions({
      model: 'luna-latest',
      chunks: [{ id: 'doc-c1', documentId: 'doc', text: '教材' }],
      settings: { counts: { single: 0, multiple: 0, true_false: 1, short_answer: 0 }, difficulty: 'easy', points: 5, language: 'zh-TW', instructions: '' },
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock.mock.calls[0][0]).toContain('/responses');
    expect(request).not.toHaveProperty('temperature');
    expect(request.reasoning).toEqual({ effort: 'medium' });
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify({ questions: [{ ...valid.questions[0], explanation: ['解析陣列'], sources: [{ ...valid.questions[0].sources[0], pageNumber: '3' }] }] }) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(valid) }), { status: 200 }));
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
    expect(retryRequest.input).toContain('不要把字串包在陣列中');
    expect(retryRequest.input).toContain('第一次回覆的原文');
    expect(retryRequest.input).toContain('sources.pageNumber');
    expect(retryRequest.input).toContain('"pageNumber":"3"');
    vi.unstubAllGlobals();
  });
});
