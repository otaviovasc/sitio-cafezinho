export type PeriodDays = 30 | 90 | 180 | 365 | null;

export function filterByPeriod<T extends { date: string }>(rows: T[], days: PeriodDays, referenceDate: string) {
  if (days === null) return rows;
  const cutoff = new Date(`${referenceDate}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  return rows.filter((row) => row.date >= cutoffKey && row.date <= referenceDate);
}
