import { decimalString } from './format.js';

export function calculateDailyMilkTotal(morningLiters: number, afternoonLiters: number) {
  return Number(decimalString(morningLiters + afternoonLiters));
}

export function summarizeDailyMilk(rows: Array<{ productionDate: string; totalLiters: string | number }>, month: string) {
  const monthRows = rows.filter((row) => row.productionDate.startsWith(month));
  const total = monthRows.reduce((sum, row) => sum + Number(row.totalLiters), 0);
  return { measuredDays: monthRows.length, total, average: monthRows.length ? total / monthRows.length : 0 };
}
