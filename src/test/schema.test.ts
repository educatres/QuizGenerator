import { describe, expect, it } from 'vitest';
import { extractJson, generatedResponseSchema } from '../domain/questionSchema';

const source = { documentId: 'doc', chunkId: 'doc-c1', pageNumber: 1, quote: '教材引文' };

describe('question schema', () => {
  it('accepts a valid single choice question', () => {
    const result = generatedResponseSchema.safeParse({ questions: [{ type: 'single', stem: '哪一個敘述正確？', options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }], correctOptionIds: ['A'], explanation: '因為教材如此說明。', sources: [source], difficulty: 'medium', points: 10 }] });
    expect(result.success).toBe(true);
  });

  it('rejects single choice questions with multiple answers', () => {
    const result = generatedResponseSchema.safeParse({ questions: [{ type: 'single', stem: '哪一個敘述正確？', options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }], correctOptionIds: ['A', 'B'], explanation: '解析', sources: [source], difficulty: 'easy', points: 5 }] });
    expect(result.success).toBe(false);
  });

  it('extracts fenced JSON', () => expect(extractJson('```json\n{"questions":[]}\n```')).toEqual({ questions: [] }));
});
