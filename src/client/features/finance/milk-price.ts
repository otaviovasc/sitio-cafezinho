/** Tipos e helpers do preço mensal do leite (sem componentes — fast-refresh). */

export type MonthlyMilkPrice = {
  id: string;
  month: string;
  pricePerLiter: string;
  notes: string | null;
  updatedAt: string;
};

export type MilkPriceSummary = {
  month: string;
  price: MonthlyMilkPrice | null;
  collection: {
    collectedLiters: number;
    collectionCount: number;
    pricePerLiter: number | null;
    estimatedValue: number | null;
    estimateBasis: 'COLLECTED_LITERS_X_MONTHLY_PRICE' | null;
  };
  production: { liters: number; measuredDays: number; averageOnMeasuredDays: number };
  limitations: string[];
};

export function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return 'mês selecionado';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function formatMilkPrice(value: string | number) {
  return `${Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })}/L`;
}
