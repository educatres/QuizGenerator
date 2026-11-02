import type { GeneratedQuestion } from '../domain/questionSchema';
import type { GenerationSettings, MaterialChunk, PastExamStrategy, ProviderId } from '../domain/types';

export interface ModelOption { id: string; label: string; created?: number }
export type ReasoningEffort = 'low' | 'medium' | 'high';
export interface GenerateRequest {
  model: string;
  /** Optional per-provider endpoint override. Defaults to the adapter endpoint. */
  baseUrl?: string;
  reasoningEffort?: ReasoningEffort;
  chunks: MaterialChunk[];
  settings: GenerationSettings;
  pastExamChunks?: MaterialChunk[];
  pastExamStrategy?: PastExamStrategy;
  signal?: AbortSignal;
}
export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  baseUrl: string;
  keyUrl: string;
  listModels(baseUrl?: string): Promise<ModelOption[]>;
  testGeneration(model: string, baseUrl?: string, reasoningEffort?: ReasoningEffort): Promise<void>;
  generateQuestions(request: GenerateRequest): Promise<GeneratedQuestion[]>;
}
