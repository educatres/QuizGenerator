import type { Question } from '../domain/types';

export interface ExamVersion {
  label: 'A' | 'B';
  questions: Question[];
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const output = [...items]; let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = output.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [output[i], output[j]] = [output[j], output[i]]; }
  return output;
}

export function buildExamVersions(questions: Question[], seed: number): ExamVersion[] {
  const a = seededShuffle(questions, seed);
  const offset = a.length > 1 ? 1 + ((seed >>> 0) % (a.length - 1)) : 0;
  const b = offset ? [...a.slice(offset), ...a.slice(0, offset)] : [...a];
  return [{ label: 'A', questions: a }, { label: 'B', questions: b }];
}
