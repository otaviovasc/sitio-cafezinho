// Guardrails de domínio: faixas plausíveis aplicadas na validação (cliente e
// servidor). Barram o claramente impossível e sinalizam o suspeito para
// conferência — sem transformar em fato nem impedir um valor real extremo que a
// pessoa confirme. Fonte única; ajuste os limites aqui.

export type Range = { min: number; max: number };

export const GUARDRAILS = {
  dailyMilkLiters: { min: 0, max: 20000 },
  individualMilkLiters: { min: 0, max: 80 },
  collectionLiters: { min: 0, max: 30000 },
  weightKg: { min: 20, max: 1500 },
  amount: { min: 0, max: 10_000_000 },
  // Quantidade de alimento por linha (na unidade canônica): cobre desde 0,5 kg
  // de mineral até dezenas de toneladas de silagem compradas de uma vez.
  feedQuantity: { min: 0, max: 100_000 },
} as const satisfies Record<string, Range>;

export function rangeError(value: number, range: Range, unit = ''): string | undefined {
  if (!Number.isFinite(value)) return 'Informe um número válido.';
  if (value < range.min) return `Use um valor a partir de ${range.min}${unit}.`;
  if (value > range.max) return `Valor acima do esperado (máx. ${range.max}${unit}). Confira.`;
  return undefined;
}
