import Dexie, { type EntityTable } from 'dexie';
import type { ExamMeta, MaterialDocument, PastExamStrategy, Question } from '../domain/types';

interface Snapshot {
  id: 'current';
  materials: MaterialDocument[];
  pastExams?: MaterialDocument[];
  pastExamStrategy?: PastExamStrategy;
  questions: Question[];
  exam: ExamMeta;
  updatedAt: string;
}

class ExamDatabase extends Dexie {
  snapshots!: EntityTable<Snapshot, 'id'>;
  constructor() {
    super('TeacherExamStudio');
    this.version(1).stores({ snapshots: 'id,updatedAt' });
  }
}

export const db = new ExamDatabase();
export const loadSnapshot = () => db.snapshots.get('current');
export const saveSnapshot = (snapshot: Omit<Snapshot, 'id' | 'updatedAt'>) => db.snapshots.put({ id: 'current', updatedAt: new Date().toISOString(), ...snapshot });
export const clearSnapshot = () => db.snapshots.delete('current');
