import { api } from '../../lib/api';
import type { MilkSessionReference } from './ExistingMilkSessionConflict';

export async function findMilkSessionByDate(sessionDate: string, herdGroupId?: string | null) {
  const sessions = await api<MilkSessionReference[]>('/api/milk-sessions');
  return sessions.find((session) => session.sessionDate === sessionDate
    && (session.herdGroupId ?? null) === (herdGroupId ?? null)) ?? null;
}
