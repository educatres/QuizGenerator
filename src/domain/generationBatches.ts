import type { Question } from './types';

export const LEGACY_GENERATION_ID = 'legacy-imported';

export interface GenerationBatch {
  id: string;
  sequence?: number;
  createdAt: string;
  providerId: Question['providerId'];
  modelId: string;
  questions: Question[];
}

export function questionGenerationId(question: Question) {
  return question.generationId || LEGACY_GENERATION_ID;
}

export function groupQuestionsByGeneration(questions: Question[]): GenerationBatch[] {
  const grouped = new Map<string, GenerationBatch>();

  for (const question of questions) {
    const id = questionGenerationId(question);
    const existing = grouped.get(id);
    if (existing) existing.questions.push(question);
    else grouped.set(id, {
      id,
      createdAt: question.createdAt,
      providerId: question.providerId,
      modelId: question.modelId,
      questions: [question],
    });
  }

  let sequence = 0;
  return [...grouped.values()].map(batch => batch.id === LEGACY_GENERATION_ID
    ? batch
    : { ...batch, sequence: ++sequence });
}
