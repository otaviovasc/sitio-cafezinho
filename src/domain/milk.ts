export type RealSplit = { animalId?: string | null; morning: number; afternoon: number; date: string };

export type Estimate = {
  morning: number;
  afternoon: number;
  method: 'ANIMAL_HISTORY' | 'HERD_HISTORY' | 'DEFAULT_50_50';
  description: string;
};

function ratio(rows: RealSplit[]) {
  const valid = rows.filter((row) => row.morning >= 0 && row.afternoon >= 0 && row.morning + row.afternoon > 0);
  if (!valid.length) return null;
  return valid.reduce((sum, row) => sum + row.morning / (row.morning + row.afternoon), 0) / valid.length;
}

export function estimateSplit(total: number, animalId: string | null, history: RealSplit[], beforeDate?: string): Estimate {
  const eligibleHistory = beforeDate ? history.filter((row) => row.date < beforeDate) : history;
  const animalRows = eligibleHistory
    .filter((row) => animalId && row.animalId === animalId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  let morningRatio: number;
  let method: Estimate['method'];
  let description: string;
  if (animalRows.length >= 3) {
    morningRatio = ratio(animalRows) ?? 0.5;
    method = 'ANIMAL_HISTORY';
    description = 'Média das medições separadas recentes deste animal';
  } else if (eligibleHistory.length >= 10) {
    morningRatio = ratio(eligibleHistory) ?? 0.5;
    method = 'HERD_HISTORY';
    description = 'Média das medições separadas do rebanho';
  } else {
    morningRatio = 0.5;
    method = 'DEFAULT_50_50';
    description = 'Divisão padrão 50/50';
  }
  const morning = Math.round(total * morningRatio * 100) / 100;
  return { morning, afternoon: Math.round((total - morning) * 100) / 100, method, description };
}

export function confirmedTotal(rows: Array<{ totalLiters: string | number; status: string }>) {
  return rows.filter((row) => row.status === 'CONFIRMED').reduce((sum, row) => sum + Number(row.totalLiters), 0);
}

export function calculateTotal(morning: number | null, afternoon: number | null, total?: number | null) {
  if (morning !== null || afternoon !== null) return (morning ?? 0) + (afternoon ?? 0);
  return total ?? null;
}
