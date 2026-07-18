import { eq, isNotNull, ne } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { feedPurchaseEntries, feedingEventItems, plantingInputs, purchases } from '../../db/schema.js';
import { computeFeedInventory, type FeedInventoryLine } from '../../domain/feeding.js';

/**
 * Saldo derivado por item do Depósito: entries de compras não canceladas −
 * consumos (tratos E plantios). Nunca é armazenado (docs/domain-rules.md);
 * recalculado a cada consulta. Compartilhado por alimentação e plantação.
 */
export async function loadFeedInventory(): Promise<FeedInventoryLine[]> {
  const db = getDb();
  const [entryRows, feedingRows, plantingRows] = await Promise.all([
    db.select({ feedItemId: feedPurchaseEntries.feedItemId, quantity: feedPurchaseEntries.quantity })
      .from(feedPurchaseEntries)
      .innerJoin(purchases, eq(feedPurchaseEntries.purchaseId, purchases.id))
      .where(ne(purchases.status, 'CANCELLED')),
    db.select({ feedItemId: feedingEventItems.feedItemId, quantity: feedingEventItems.quantity }).from(feedingEventItems),
    db.select({ feedItemId: plantingInputs.feedItemId, quantity: plantingInputs.quantity })
      .from(plantingInputs).where(isNotNull(plantingInputs.feedItemId)),
  ]);
  const plantingConsumption = plantingRows.map((row) => ({ feedItemId: row.feedItemId!, quantity: row.quantity }));
  return computeFeedInventory(entryRows, [...feedingRows, ...plantingConsumption]);
}
