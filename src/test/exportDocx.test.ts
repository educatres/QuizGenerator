import { describe, expect, it } from 'vitest';
import type { Question } from '../domain/types';
import { createExamDocx } from '../services/exportDocx';
import { buildExamVersions, seededShuffle } from '../services/examVersions';
import { createExamText } from '../services/exportText';

const question: Question = { id: 'q1', type: 'single', stem: '第一題', options: [{ id: 'A', text: '答案' }, { id: 'B', text: '干擾' }], correctOptionIds: ['A'], explanation: '解析', sources: [{ documentId: 'd', chunkId: 'c', quote: '答案' }], difficulty: 'easy', points: 10, status: 'accepted', revision: 1, providerId: 'cgu', modelId: 'model', createdAt: '2026-01-01' };
const meta = { title: '測驗', subtitle: '', duration: 50, seed: 42 };

describe('DOCX exports', () => {
  it('uses repeatable seeded ordering', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 2026)).toEqual(seededShuffle([1, 2, 3, 4, 5], 2026));
  });

  it('creates A and B versions from the same questions with different numbering', () => {
    const questions = [question, { ...question, id: 'q2', stem: '第二題' }, { ...question, id: 'q3', stem: '第三題' }];
    const [versionA, versionB] = buildExamVersions(questions, meta.seed);
    expect(new Set(versionA.questions.map(item => item.id))).toEqual(new Set(versionB.questions.map(item => item.id)));
    expect(versionA.questions.map(item => item.id)).not.toEqual(versionB.questions.map(item => item.id));
    expect(versionA.questions.every((item, index) => item.id !== versionB.questions[index].id)).toBe(true);
  });

  it('creates editable DOCX files for standard and A/B exams', async () => {
    const questions = [question, { ...question, id: 'q2', stem: '第二題' }];
    const [standard, ab] = await Promise.all([createExamDocx(meta, questions, 'standard'), createExamDocx(meta, questions, 'ab')]);
    expect(standard.size).toBeGreaterThan(1000);
    expect(ab.size).toBeGreaterThan(standard.size);
    expect(standard.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('creates a UTF-8 text exam with questions, options and answers', () => {
    const text = createExamText(meta, [question]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('1. 第一題［單選題，10 分］');
    expect(text).toContain('(A) 答案');
    expect(text).toContain('參考答案與解析');
    expect(text).toContain('1. A');
  });
});
