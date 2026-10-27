import { z } from 'zod';

const sourceSchema = z.object({
  documentId: z.string().min(1),
  chunkId: z.string().min(1),
  pageNumber: z.number().int().positive().nullish().transform(value => value ?? undefined),
  quote: z.string().min(1).max(500),
});

const optionSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });

export const generatedQuestionSchema = z.object({
  type: z.enum(['single', 'multiple', 'true_false', 'short_answer']),
  stem: z.string().min(3),
  // Models commonly emit null for fields that do not apply to a question type.
  // Normalize those nulls while keeping type-specific requirements below strict.
  options: z.array(optionSchema).nullish().transform(value => value ?? undefined),
  correctOptionIds: z.array(z.string()).nullish().transform(value => value ?? undefined),
  correctBoolean: z.boolean().nullish().transform(value => value ?? undefined),
  referenceAnswer: z.string().nullish().transform(value => value ?? undefined),
  rubric: z.string().nullish().transform(value => value ?? undefined),
  explanation: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  points: z.number().positive().max(100),
}).superRefine((q, ctx) => {
  if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length < 2)) {
    ctx.addIssue({ code: 'custom', message: '選擇題至少需要兩個選項', path: ['options'] });
  }
  if (q.type === 'single' && q.correctOptionIds?.length !== 1) {
    ctx.addIssue({ code: 'custom', message: '單選題必須有一個答案', path: ['correctOptionIds'] });
  }
  if (q.type === 'multiple' && (!q.correctOptionIds || q.correctOptionIds.length < 1)) {
    ctx.addIssue({ code: 'custom', message: '複選題必須有答案', path: ['correctOptionIds'] });
  }
  if (q.type === 'true_false' && typeof q.correctBoolean !== 'boolean') {
    ctx.addIssue({ code: 'custom', message: '是非題必須有布林答案', path: ['correctBoolean'] });
  }
  if (q.type === 'short_answer' && !q.referenceAnswer?.trim()) {
    ctx.addIssue({ code: 'custom', message: '簡答題必須有參考答案', path: ['referenceAnswer'] });
  }
});

export const generatedResponseSchema = z.object({ questions: z.array(generatedQuestionSchema).min(1) });
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!candidate.trim()) throw new Error('模型沒有回傳 JSON。');
  try { return JSON.parse(candidate); }
  catch { throw new Error('模型回傳的 JSON 無法解析，請重試或更換模型。'); }
}
