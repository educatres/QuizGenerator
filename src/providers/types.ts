import type { GeneratedQuestion } from '../domain/questionSchema';
import type { GenerationSettings, MaterialChunk, ProviderId } from '../domain/types';

export interface ModelOption { id: string; label: string; created?: number }
export interface GenerateRequest { model: string; chunks: MaterialChunk[]; settings: GenerationSettings; signal?: AbortSignal }
export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  baseUrl: string;
  keyUrl: string;
  listModels(): Promise<ModelOption[]>;
  testGeneration(model: string): Promise<void>;
  generateQuestions(request: GenerateRequest): Promise<GeneratedQuestion[]>;
}
