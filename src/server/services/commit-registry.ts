import { getDb } from '../../db/client.js';
import { feedingEventItems, feedingEvents, feedPurchaseEntries, mastitisCases, milkCollections, purchases, revenues } from '../../db/schema.js';
import { decimalString } from '../../domain/format.js';
import type { ProposedActionType } from '../../domain/nl/resolve.js';
import { fail } from '../http/api-error.js';
import { createDailyMilkTotal } from './daily-milk.service.js';

type CollectionSource = 'DRIVER_READING' | 'TANK_READING' | 'RECEIPT' | 'OTHER';
type RevenueCategory = 'MILK_SALE' | 'CALF_SALE' | 'CULL_SALE' | 'ANIMAL_SALE' | 'OTHER';
type RevenueStatus = 'EXPECTED' | 'RECEIVED' | 'CANCELLED';
type PurchaseCategory = 'FEED' | 'MINERAL_SUPPLEMENT' | 'MEDICINE' | 'MILKING_AND_HYGIENE' | 'MAINTENANCE' | 'FUEL' | 'ENERGY' | 'ANIMAL_PURCHASE' | 'OTHER';
type PurchaseStatus = 'OPEN' | 'PAID' | 'CANCELLED';
type MastitisQuarter = 'FRONT_LEFT' | 'FRONT_RIGHT' | 'REAR_LEFT' | 'REAR_RIGHT' | 'MULTIPLE' | 'UNKNOWN';
type MastitisDetection = 'VISUAL' | 'BLACK_PLATE' | 'CMT' | 'VETERINARY' | 'OTHER' | 'UNKNOWN';

/**
 * Costura extensível entre uma ação proposta e o endpoint validado que já
 * existe. Acrescentar um tipo de ação = acrescentar uma entrada aqui. As ações
 * de múltiplas linhas (controle individual, pesagem) não entram aqui: elas
 * reaproveitam a revisão de importação, que faz o casamento por animal.
 */

export type CommitResult = { recordType: string; recordId: string };
type Committer = (payload: Record<string, unknown>) => Promise<CommitResult>;

const committers: Partial<Record<ProposedActionType, Committer>> = {
  DAILY_MILK_TOTAL: async (payload) => {
    const morning = payload.morningLiters;
    const afternoon = payload.afternoonLiters;
    const created = await createDailyMilkTotal({
      productionDate: String(payload.productionDate),
      herdGroupId: (payload.herdGroupId as string | null | undefined) ?? null,
      morningLiters: morning === null || morning === undefined ? null : Number(morning),
      afternoonLiters: afternoon === null || afternoon === undefined ? null : Number(afternoon),
      notes: (payload.notes as string | null | undefined) ?? null,
    });
    return { recordType: 'daily_milk_total', recordId: created.id };
  },

  MILK_COLLECTION: async (payload) => {
    const liters = payload.liters;
    if (liters === null || liters === undefined) return fail('Informe o volume da coleta.', 400, 'LITERS_REQUIRED');
    const [created] = await getDb().insert(milkCollections).values({
      collectionDate: String(payload.collectionDate),
      liters: decimalString(Number(liters)),
      source: (payload.source as CollectionSource | undefined) ?? 'TANK_READING',
      notes: (payload.notes as string | null | undefined) ?? null,
    }).returning();
    return { recordType: 'milk_collection', recordId: created.id };
  },

  REVENUE: async (payload) => {
    const amount = payload.amount;
    if (amount === null || amount === undefined) return fail('Informe o valor da receita.', 400, 'AMOUNT_REQUIRED');
    const status = (payload.status as RevenueStatus | undefined) ?? 'EXPECTED';
    const [created] = await getDb().insert(revenues).values({
      revenueDate: String(payload.revenueDate),
      category: (payload.category as RevenueCategory | undefined) ?? 'OTHER',
      description: String(payload.description),
      amount: decimalString(Number(amount)),
      status,
      receivedAt: status === 'RECEIVED' ? new Date() : null,
      buyerName: (payload.buyerName as string | null | undefined) ?? null,
      notes: (payload.notes as string | null | undefined) ?? null,
    }).returning();
    return { recordType: 'revenue', recordId: created.id };
  },

  PURCHASE: async (payload) => {
    const amount = payload.totalAmount;
    if (amount === null || amount === undefined) return fail('Informe o valor da compra.', 400, 'AMOUNT_REQUIRED');
    const total = decimalString(Number(amount));
    const status = (payload.status as PurchaseStatus | undefined) ?? 'OPEN';
    const [created] = await getDb().insert(purchases).values({
      purchaseDate: String(payload.purchaseDate),
      description: String(payload.description),
      category: (payload.category as PurchaseCategory | undefined) ?? 'OTHER',
      grossAmount: total,
      totalAmount: total,
      dueDate: (payload.dueDate as string | null | undefined) ?? null,
      supplierId: (payload.supplierId as string | null | undefined) ?? null,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
      notes: (payload.notes as string | null | undefined) ?? null,
    }).returning();
    return { recordType: 'purchase', recordId: created.id };
  },

  // Compra de alimento falada: a compra financeira real + a entry que credita
  // o inventário, na mesma transação. A revisão humana já confirmou item e
  // quantidade — aqui só validamos o essencial.
  FEED_PURCHASE: async (payload) => {
    const amount = payload.totalAmount;
    if (amount === null || amount === undefined) return fail('Informe o valor da compra.', 400, 'AMOUNT_REQUIRED');
    const feedItemId = payload.feedItemId as string | null | undefined;
    if (!feedItemId) return fail('Selecione o item do catálogo antes de salvar.', 400, 'FEED_ITEM_REQUIRED');
    const quantity = payload.quantity;
    if (quantity === null || quantity === undefined || Number(quantity) <= 0) return fail('Informe a quantidade comprada na unidade do item.', 400, 'QUANTITY_REQUIRED');
    const total = decimalString(Number(amount));
    const status = (payload.status as PurchaseStatus | undefined) ?? 'OPEN';
    return getDb().transaction(async (tx) => {
      const [purchase] = await tx.insert(purchases).values({
        purchaseDate: String(payload.purchaseDate),
        description: String(payload.description ?? 'Compra de alimento'),
        category: 'FEED',
        grossAmount: total,
        totalAmount: total,
        supplierId: (payload.supplierId as string | null | undefined) ?? null,
        status,
        paidAt: status === 'PAID' ? new Date() : null,
        notes: (payload.notes as string | null | undefined) ?? null,
      }).returning();
      await tx.insert(feedPurchaseEntries).values({
        feedItemId,
        purchaseId: purchase.id,
        quantity: Number(quantity).toFixed(3),
      });
      return { recordType: 'purchase', recordId: purchase.id };
    });
  },

  // Trato falado: feeding_event + linhas na mesma transação. O saldo derivado
  // pode ficar negativo — a revisão humana é a confirmação explícita.
  FEEDING_EVENT: async (payload) => {
    const context = payload.context as string | null | undefined;
    if (!context || !['MILKING', 'PASTURE', 'STATION'].includes(context)) {
      return fail('Informe onde o trato foi dado (ordenha, estação ou pasto).', 400, 'CONTEXT_REQUIRED');
    }
    const herdGroupId = (payload.herdGroupId as string | null | undefined) ?? null;
    if (context === 'MILKING' && !herdGroupId) return fail('Selecione o lote do trato da ordenha.', 400, 'GROUP_REQUIRED');
    const rawItems = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
    const items = rawItems.map((item) => ({
      feedItemId: item.feedItemId as string | null | undefined,
      quantity: item.quantity as number | string | null | undefined,
    }));
    if (!items.length) return fail('Adicione pelo menos um item.', 400, 'ITEMS_REQUIRED');
    for (const item of items) {
      if (!item.feedItemId) return fail('Selecione o item de cada linha antes de salvar.', 400, 'FEED_ITEM_REQUIRED');
      if (item.quantity === null || item.quantity === undefined || Number(item.quantity) <= 0) {
        return fail('Informe a quantidade de cada linha na unidade do item.', 400, 'QUANTITY_REQUIRED');
      }
    }
    return getDb().transaction(async (tx) => {
      const [event] = await tx.insert(feedingEvents).values({
        date: String(payload.date),
        context: context as 'MILKING' | 'PASTURE' | 'STATION',
        herdGroupId,
        notes: (payload.notes as string | null | undefined) ?? null,
      }).returning();
      await tx.insert(feedingEventItems).values(items.map((item) => ({
        feedingEventId: event.id,
        feedItemId: item.feedItemId!,
        quantity: Number(item.quantity).toFixed(3),
      })));
      return { recordType: 'feeding_event', recordId: event.id };
    });
  },

  MASTITIS_CASE: async (payload) => {
    const animalId = payload.animalId as string | null | undefined;
    if (!animalId) return fail('Selecione o animal antes de salvar.', 400, 'ANIMAL_REQUIRED');
    const observedSigns = (payload.observedSigns as string | null | undefined) ?? null;
    const notes = (payload.notes as string | null | undefined) ?? null;
    if (!observedSigns && !notes) return fail('Informe o sinal observado ou uma observação.', 400, 'SIGN_REQUIRED');
    const [created] = await getDb().insert(mastitisCases).values({
      animalId,
      detectedAt: new Date(String(payload.detectedAt)),
      affectedQuarter: (payload.affectedQuarter as MastitisQuarter | undefined) ?? null,
      detectionMethod: (payload.detectionMethod as MastitisDetection | undefined) ?? null,
      observedSigns,
      status: 'OBSERVATION',
      notes,
    }).returning();
    return { recordType: 'mastitis_case', recordId: created.id };
  },
};

export async function commitProposedAction(
  actionType: ProposedActionType,
  payload: Record<string, unknown>,
): Promise<CommitResult> {
  const committer = committers[actionType];
  if (!committer) return fail('Esta ação é revisada e salva na tela específica, não diretamente por aqui.', 400, 'REQUIRES_REVIEW_HANDOFF');
  return committer(payload);
}
