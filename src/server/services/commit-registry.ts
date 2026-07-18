import { getDb } from '../../db/client.js';
import { mastitisCases, milkCollections, purchases, revenues } from '../../db/schema.js';
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
