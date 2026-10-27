import { describe, expect, it } from 'vitest';
import type { Question } from '../domain/types';
import { createExamDocx } from '../services/exportDocx';
import { buildExamVersions, createAbPrintHtml, createPrintHtml, seededShuffle } from '../services/exportHtml';

const question: Question = { id: 'q1', type: 'single', stem: '<script>alert(1)</script>', options: [{ id: 'A', text: '答案' }, { id: 'B', text: '干擾' }], correctOptionIds: ['A'], explanation: '解析', sources: [{ documentId: 'd', chunkId: 'c', quote: '答案' }], difficulty: 'easy', points: 10, status: 'accepted', revision: 1, providerId: 'cgu', modelId: 'model', createdAt: '2026-01-01' };
const meta = { title: '測驗', subtitle: '', duration: 50, seed: 42 };

describe('HTML exports', () => {
  it('escapes untrusted question text in print HTML', () => {
    const html = createPrintHtml(meta, [question]);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('A 卷');
  });

  it('uses repeatable seeded ordering', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 2026)).toEqual(seededShuffle([1, 2, 3, 4, 5], 2026));
  });

  it('creates A and B versions from the same questions with different numbering', () => {
    const questions = [question, { ...question, id: 'q2', stem: '第二題' }, { ...question, id: 'q3', stem: '第三題' }];
    const [versionA, versionB] = buildExamVersions(questions, meta.seed);
    expect(new Set(versionA.questions.map(item => item.id))).toEqual(new Set(versionB.questions.map(item => item.id)));
    expect(versionA.questions.map(item => item.id)).not.toEqual(versionB.questions.map(item => item.id));
    expect(versionA.questions.every((item, index) => item.id !== versionB.questions[index].id)).toBe(true);
    const html = createAbPrintHtml(meta, questions);
    expect(html).toContain('A 卷');
    expect(html).toContain('B 卷');
  });

  it('creates editable DOCX files for standard and A/B exams', async () => {
    const questions = [question, { ...question, id: 'q2', stem: '第二題' }];
    const [standard, ab] = await Promise.all([createExamDocx(meta, questions, 'standard'), createExamDocx(meta, questions, 'ab')]);
    expect(standard.size).toBeGreaterThan(1000);
    expect(ab.size).toBeGreaterThan(standard.size);
    expect(standard.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});
