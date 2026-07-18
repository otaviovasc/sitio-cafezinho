import { parseDecimal } from '../../../domain/format';
import { tonsToKg } from '../../../domain/feeding';

/** Uma linha digitada de item+quantidade; `unit` TONS só existe para itens em KG. */
export type FeedLineDraft = { feedItemId: string; quantity: string; unit: 'CANONICAL' | 'TONS' };

export const emptyFeedLine = (): FeedLineDraft => ({ feedItemId: '', quantity: '', unit: 'CANONICAL' });

/** Converte a linha digitada para a unidade canônica (t → kg ×1000, nunca no banco). */
export function parsedLineQuantity(line: FeedLineDraft): number | null {
  const parsed = parseDecimal(line.quantity);
  if (parsed === null) return null;
  return line.unit === 'TONS' ? tonsToKg(parsed) : parsed;
}
