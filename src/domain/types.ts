export type ProviderId = 'cgu' | 'openai' | 'xai' | 'gemini';
export type QuestionType = 'single' | 'multiple' | 'true_false' | 'short_answer';
export type QuestionStatus = 'candidate' | 'accepted' | 'rejected';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PastExamStrategy = 'transform' | 'avoid';

export interface SourceRef {
  documentId: string;
  chunkId: string;
  pageNumber?: number;
  quote: string;
}

export interface Question {
  id: string;
  /** Identifies the generation request that produced this question. Older imports may not have one. */
  generationId?: string;
  type: QuestionType;
  stem: string;
  options?: Array<{ id: string; text: string }>;
  correctOptionIds?: string[];
  correctBoolean?: boolean;
  referenceAnswer?: string;
  rubric?: string;
  explanation: string;
  sources: SourceRef[];
  difficulty: Difficulty;
  points: number;
  status: QuestionStatus;
  revision: number;
  providerId: ProviderId;
  modelId: string;
  createdAt: string;
}

export interface MaterialChunk {
  id: string;
  documentId: string;
  pageNumber?: number;
  text: string;
}

export interface MaterialDocument {
  id: string;
  name: string;
  kind: 'pdf' | 'txt' | 'md' | 'pasted';
  size: number;
  pageCount?: number;
  characterCount: number;
  chunks: MaterialChunk[];
  createdAt: string;
  warning?: string;
}

export interface GenerationSettings {
  counts: Record<QuestionType, number>;
  difficulty: Difficulty;
  points: number;
  language: 'zh-TW';
  instructions: string;
}

export interface ExamMeta {
  title: string;
  subtitle: string;
  duration: number;
  seed: number;
}

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export const questionTypeLabels: Record<QuestionType, string> = {
  single: '單選題', multiple: '複選題', true_false: '是非題', short_answer: '簡答題',
};
export const difficultyLabels: Record<Difficulty, string> = { easy: '基礎', medium: '適中', hard: '進階' };
