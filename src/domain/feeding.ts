/**
 * Domínio do inventário de alimentação. Regra central (anti-inferência): um
 * item só pode ser usado se entrou por compra registrada; o saldo é sempre
 * DERIVADO (comprado − consumido), nunca armazenado. Toneladas são açúcar de
 * formulário/fala: convertem para KG antes de chegar ao banco (×1000).
 */

export type FeedUnit = 'KG' | 'LITER' | 'UNIT';
export type FeedingContext = 'MILKING' | 'PASTURE' | 'STATION';

export const feedUnitSuffix: Record<FeedUnit, string> = { KG: 'kg', LITER: 'L', UNIT: 'un' };

export const feedingContextLabels: Record<FeedingContext, string> = {
  MILKING: 'Ordenha',
  PASTURE: 'Pasto',
  STATION: 'Estação de alimentação',
};

const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

/** Converte toneladas ditas/digitadas para a unidade canônica KG. */
export function tonsToKg(tons: number): number {
  return round3(tons * 1000);
}

export type FeedInventoryLine = {
  feedItemId: string;
  purchasedQuantity: number;
  consumedQuantity: number;
  /** Saldo derivado; pode ficar negativo quando o histórico de compras está incompleto. */
  balance: number;
};

/**
 * Saldo derivado por item: soma das entries de compra menos soma dos consumos.
 * Entradas de compras canceladas devem ser filtradas ANTES por quem consulta o
 * banco (compra cancelada não entra em totais). Itens sem movimento não
 * aparecem — quem lista o catálogo completa com zero.
 */
export function computeFeedInventory(
  purchaseEntries: Array<{ feedItemId: string; quantity: string | number }>,
  consumptionItems: Array<{ feedItemId: string; quantity: string | number }>,
): FeedInventoryLine[] {
  const byItem = new Map<string, { purchased: number; consumed: number }>();
  const line = (feedItemId: string) => {
    const existing = byItem.get(feedItemId);
    if (existing) return existing;
    const created = { purchased: 0, consumed: 0 };
    byItem.set(feedItemId, created);
    return created;
  };
  for (const entry of purchaseEntries) line(entry.feedItemId).purchased += Number(entry.quantity);
  for (const item of consumptionItems) line(item.feedItemId).consumed += Number(item.quantity);
  return [...byItem.entries()].map(([feedItemId, totals]) => ({
    feedItemId,
    purchasedQuantity: round3(totals.purchased),
    consumedQuantity: round3(totals.consumed),
    balance: round3(totals.purchased - totals.consumed),
  }));
}

export type FeedLineInput = { feedItemId: string; quantity: number | null };

/**
 * Validação das linhas de um trato ou de uma compra: pelo menos uma linha,
 * item selecionado, quantidade > 0 e sem item repetido. Retorna a primeira
 * mensagem de erro ou null.
 */
export function feedLinesError(lines: FeedLineInput[]): string | null {
  if (!lines.length) return 'Adicione pelo menos um item.';
  const seen = new Set<string>();
  for (const lineInput of lines) {
    if (!lineInput.feedItemId) return 'Selecione o item em todas as linhas.';
    if (lineInput.quantity === null || !Number.isFinite(lineInput.quantity) || lineInput.quantity <= 0) {
      return 'Informe uma quantidade maior que zero em todas as linhas.';
    }
    if (seen.has(lineInput.feedItemId)) return 'O mesmo item aparece em mais de uma linha; some as quantidades.';
    seen.add(lineInput.feedItemId);
  }
  return null;
}

/**
 * Itens consumindo além do saldo derivado. Não é bloqueio: o histórico de
 * compras pode estar incompleto — a UI avisa e pede confirmação explícita
 * (padrão confirmPossibleDuplicate das coletas).
 */
export function linesBeyondBalance(
  lines: Array<{ feedItemId: string; quantity: number }>,
  inventory: FeedInventoryLine[],
): Array<{ feedItemId: string; quantity: number; balance: number }> {
  const balanceByItem = new Map(inventory.map((entry) => [entry.feedItemId, entry.balance]));
  return lines
    .map((lineInput) => ({ ...lineInput, balance: balanceByItem.get(lineInput.feedItemId) ?? 0 }))
    .filter((lineInput) => lineInput.quantity > lineInput.balance);
}
