import { decimalString } from './format.js';

export type DailyMilkScopeRow = {
  id?: string;
  productionDate: string;
  totalLiters: string | number;
  herdGroupId?: string | null;
};

export type ResolvedDailyMilk = {
  productionDate: string;
  totalLiters: number;
  basis: 'HERD_TOTAL' | 'GROUP_SUM';
  groupCount: number;
  recordIds: string[];
};

export function calculateDailyMilkTotal(morningLiters: number, afternoonLiters: number | null) {
  return Number(decimalString(morningLiters + (afternoonLiters ?? 0)));
}

export function resolveDailyMilkByDate(rows: DailyMilkScopeRow[]) {
  const dates = [...new Set(rows.map((row) => row.productionDate))].sort();
  return dates.flatMap((productionDate): ResolvedDailyMilk[] => {
    const dayRows = rows.filter((row) => row.productionDate === productionDate);
    const herdTotal = dayRows.find((row) => !row.herdGroupId);
    const groupRows = dayRows.filter((row) => Boolean(row.herdGroupId));
    if (herdTotal) {
      return [{
        productionDate,
        totalLiters: Number(decimalString(Number(herdTotal.totalLiters))),
        basis: 'HERD_TOTAL',
        groupCount: groupRows.length,
        recordIds: herdTotal.id ? [herdTotal.id] : [],
      }];
    }
    if (!groupRows.length) return [];
    return [{
      productionDate,
      totalLiters: Number(decimalString(groupRows.reduce((sum, row) => sum + Number(row.totalLiters), 0))),
      basis: 'GROUP_SUM',
      groupCount: new Set(groupRows.map((row) => row.herdGroupId)).size,
      recordIds: groupRows.flatMap((row) => row.id ? [row.id] : []),
    }];
  });
}

export function resolveDailyMilkDay(rows: DailyMilkScopeRow[], productionDate: string) {
  return resolveDailyMilkByDate(rows.filter((row) => row.productionDate === productionDate))[0] ?? null;
}

export function summarizeDailyMilk(rows: DailyMilkScopeRow[], month: string) {
  const monthRows = resolveDailyMilkByDate(rows).filter((row) => row.productionDate.startsWith(month));
  const total = monthRows.reduce((sum, row) => sum + Number(row.totalLiters), 0);
  const roundedTotal = Number(decimalString(total));
  return { measuredDays: monthRows.length, total: roundedTotal, average: monthRows.length ? roundedTotal / monthRows.length : 0 };
}
