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

  it('normalizes null fields that do not apply to the question type', () => {
    const result = generatedResponseSchema.safeParse({ questions: [{
      type: 'single', stem: '哪一個敘述正確？',
      options: [{ id: 'A', text: '甲' }, { id: 'B', text: '乙' }], correctOptionIds: ['A'],
      correctBoolean: null, referenceAnswer: null, rubric: null,
      explanation: '解析', sources: [{ ...source, pageNumber: null }], difficulty: 'easy', points: 5,
    }] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0].correctBoolean).toBeUndefined();
      expect(result.data.questions[0].sources[0].pageNumber).toBeUndefined();
    }
  });

  it('still rejects a true/false question whose required answer is null', () => {
    const result = generatedResponseSchema.safeParse({ questions: [{ type: 'true_false', stem: '這個敘述正確嗎？', correctBoolean: null, explanation: '解析', sources: [source], difficulty: 'easy', points: 5 }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('是非題必須有布林答案');
  });

  it('extracts fenced JSON', () => expect(extractJson('```json\n{"questions":[]}\n```')).toEqual({ questions: [] }));
});
