import { describe, expect, it } from 'vitest';
import { buildQuestionPrompt } from '../services/prompts';

const settings = { counts: { single: 1, multiple: 0, true_false: 0, short_answer: 0 }, difficulty: 'medium' as const, points: 10, language: 'zh-TW' as const, instructions: '' };

describe('question prompt past-exam guidance', () => {
  it('keeps past exams separate from source material when transforming question types', () => {
    const prompt = buildQuestionPrompt(settings, '[教材片段]', { context: '[考古題片段]', strategy: 'transform' });
    expect(prompt).toContain('<source_material>\n[教材片段]\n</source_material>');
    expect(prompt).toContain('<past_exam_material strategy="transform">');
    expect(prompt).toContain('改用不同題型、情境與問法重新命題');
    expect(prompt).toContain('不得在 sources 引用 <past_exam_material>');
  });

  it('instructs the model to avoid prior exam concepts and similar wording', () => {
    const prompt = buildQuestionPrompt(settings, '[教材片段]', { context: '[考古題片段]', strategy: 'avoid' });
    expect(prompt).toContain('避開考古題已使用的題意、考點與相似問法');
  });
});
