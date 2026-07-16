import { dateKeyInSaoPaulo } from './purchases.js';

export const openMastitisStatuses = ['OBSERVATION', 'IN_TREATMENT', 'WITHDRAWAL_PERIOD', 'RECURRENT', 'NO_IMPROVEMENT'] as const;

export function isOpenMastitisStatus(status: string) {
  return openMastitisStatuses.includes(status as (typeof openMastitisStatuses)[number]);
}

export function mastitisActionTiming(action: { scheduledFor: string | Date; completedAt?: string | Date | null; cancelledAt?: string | Date | null }, today = dateKeyInSaoPaulo()) {
  if (action.cancelledAt) return 'CANCELLED' as const;
  if (action.completedAt) return 'COMPLETED' as const;
  const scheduledDate = dateKeyInSaoPaulo(new Date(action.scheduledFor));
  if (scheduledDate < today) return 'OVERDUE' as const;
  if (scheduledDate === today) return 'TODAY' as const;
  return 'UPCOMING' as const;
}

export function withdrawalState(withdrawalEndsAt: string | null, status: string, today = dateKeyInSaoPaulo()) {
  if (!withdrawalEndsAt || !isOpenMastitisStatus(status)) return null;
  const start = new Date(`${today}T12:00:00Z`);
  const end = new Date(`${withdrawalEndsAt}T12:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return { days, state: days < 0 ? 'PAST_DUE' as const : days === 0 ? 'ENDS_TODAY' as const : 'ACTIVE' as const };
}
