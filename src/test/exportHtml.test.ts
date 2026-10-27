import { describe, expect, it } from 'vitest';
import type { Question } from '../domain/types';
import { createInteractiveHtml, createPrintHtml, seededShuffle } from '../services/exportHtml';

const question: Question = { id: 'q1', type: 'single', stem: '<script>alert(1)</script>', options: [{ id: 'A', text: '答案' }, { id: 'B', text: '干擾' }], correctOptionIds: ['A'], explanation: '解析', sources: [{ documentId: 'd', chunkId: 'c', quote: '答案' }], difficulty: 'easy', points: 10, status: 'accepted', revision: 1, providerId: 'cgu', modelId: 'model', createdAt: '2026-01-01' };
const meta = { title: '測驗', subtitle: '', duration: 50, seed: 42 };

describe('HTML exports', () => {
  it('escapes untrusted question text in print HTML', () => {
    const html = createPrintHtml(meta, [question]);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('does not export provider metadata or API keys', () => {
    const html = createInteractiveHtml(meta, [question]);
    expect(html).not.toContain('providerId');
    expect(html).not.toContain('modelId');
    expect(html).not.toContain('apiKey');
  });

  it('uses repeatable seeded ordering', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 2026)).toEqual(seededShuffle([1, 2, 3, 4, 5], 2026));
  });
});
