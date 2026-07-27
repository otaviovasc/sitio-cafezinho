import { api } from '../../lib/api';
import type { MilkSessionReference } from './ExistingMilkSessionConflict';

export async function findMilkSessionByDate(sessionDate: string) {
  const sessions = await api<MilkSessionReference[]>('/api/milk-sessions');
  return sessions.find((session) => session.sessionDate === sessionDate) ?? null;
}
