export function isMonthKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const [year] = value.split('-').map(Number);
  return year >= 1900 && year <= 2200;
}

export function monthStorageDate(month: string) {
  if (!isMonthKey(month)) throw new Error('Mês inválido.');
  return `${month}-01`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundLiters(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizeMonthlyMilkPrice(
  collectionRows: Array<{ liters: string | number }>,
  pricePerLiter: string | number | null,
) {
  const collectedLiters = roundLiters(collectionRows.reduce((sum, row) => sum + Number(row.liters), 0));
  const normalizedPrice = pricePerLiter === null ? null : Number(pricePerLiter);
  return {
    collectedLiters,
    collectionCount: collectionRows.length,
    pricePerLiter: normalizedPrice,
    estimatedValue: normalizedPrice === null ? null : roundMoney(collectedLiters * normalizedPrice),
    estimateBasis: normalizedPrice === null ? null : 'COLLECTED_LITERS_X_MONTHLY_PRICE' as const,
  };
}
