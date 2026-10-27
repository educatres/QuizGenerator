import { describe, expect, it } from 'vitest';
import { groupQuestionsByGeneration, LEGACY_GENERATION_ID } from '../domain/generationBatches';
import type { Question } from '../domain/types';

function question(id: string, generationId?: string): Question {
  return { id, generationId, type: 'true_false', stem: id, correctBoolean: true, explanation: '', sources: [], difficulty: 'easy', points: 5, status: 'candidate', revision: 1, providerId: 'cgu', modelId: 'luna', createdAt: `2026-01-0${id.length}T00:00:00.000Z` };
}

describe('review generation batches', () => {
  it('keeps repeated generations separate while preserving question order', () => {
    const batches = groupQuestionsByGeneration([question('a1', 'run-a'), question('a2', 'run-a'), question('b1', 'run-b')]);
    expect(batches.map(batch => [batch.id, batch.sequence, batch.questions.map(item => item.id)])).toEqual([
      ['run-a', 1, ['a1', 'a2']],
      ['run-b', 2, ['b1']],
    ]);
  });

  it('places older questions without a generation id in a compatible legacy batch', () => {
    const [batch] = groupQuestionsByGeneration([question('old')]);
    expect(batch.id).toBe(LEGACY_GENERATION_ID);
    expect(batch.sequence).toBeUndefined();
  });
});
