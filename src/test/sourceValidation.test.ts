import { describe, expect, it } from 'vitest';
import type { GeneratedQuestion } from '../domain/questionSchema';
import { quoteExistsInChunk, reconcileQuestionSources } from '../services/sourceValidation';

const question: GeneratedQuestion = {
  type: 'true_false', stem: '機器學習如何從資料改善表現？', correctBoolean: true,
  options: undefined, correctOptionIds: undefined, referenceAnswer: undefined, rubric: undefined,
  explanation: '機器學習會從資料中的規律改善任務表現。',
  sources: [{ documentId: 'doc', chunkId: 'doc-c1', pageNumber: undefined, quote: '機器學習會從資料中的規律改善任務表現。' }],
  difficulty: 'easy', points: 5,
};
const chunks = [
  { id: 'doc-c1', documentId: 'doc', text: '人工智慧是一個廣泛領域。\n機器學習會從資料中的規律，改善任務表現。' },
  { id: 'doc-c2', documentId: 'doc', text: '生成式 AI 可以產生文字、圖片與聲音。' },
];

describe('source reconciliation', () => {
  it('accepts harmless punctuation and whitespace differences', () => {
    expect(quoteExistsInChunk(chunks[0].text, question.sources[0].quote)).toBe(true);
  });

  it('repairs a wrong chunk id when the quote exists elsewhere', () => {
    const input = [{ ...question, sources: [{ ...question.sources[0], chunkId: 'wrong-id' }] }];
    const result = reconcileQuestionSources(input, chunks);
    expect(result.questions[0].sources[0].chunkId).toBe('doc-c1');
    expect(result.repairedCount).toBe(1);
  });

  it('replaces an unverifiable quote with actual material text', () => {
    const input = [{ ...question, sources: [{ ...question.sources[0], quote: '教材中完全不存在的句子' }] }];
    const result = reconcileQuestionSources(input, chunks);
    const source = result.questions[0].sources[0];
    expect(quoteExistsInChunk(chunks[0].text, source.quote)).toBe(true);
    expect(source.quote).not.toContain('完全不存在');
  });
});
