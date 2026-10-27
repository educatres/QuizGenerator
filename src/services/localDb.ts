import Dexie, { type EntityTable } from 'dexie';
import type { ExamMeta, MaterialDocument, Question } from '../domain/types';

interface Snapshot { id: 'current'; materials: MaterialDocument[]; questions: Question[]; exam: ExamMeta; updatedAt: string }

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
