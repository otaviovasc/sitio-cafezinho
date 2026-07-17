import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { dailyMilkTotals, herdGroups } from '../../db/schema.js';
import { calculateDailyMilkTotal } from '../../domain/daily-milk.js';
import { decimalString } from '../../domain/format.js';
import { participatesInMilking } from '../../domain/herd.js';
import { fail } from '../http/api-error.js';

export type DailyMilkTotalInput = {
  productionDate: string;
  herdGroupId: string | null;
  morningLiters: number | null;
  afternoonLiters: number | null;
  notes?: string | null;
};

export type DailyMilkGroupScope = {
  id: string;
  name: string;
  milkingRoutine: 'MORNING_AND_AFTERNOON' | 'MORNING_ONLY' | 'NOT_MILKED';
  active: boolean;
};

export async function loadDailyMilkGroupScope(groupId: string): Promise<DailyMilkGroupScope | null> {
  const [group] = await getDb().select({
    id: herdGroups.id,
    name: herdGroups.name,
    milkingRoutine: herdGroups.milkingRoutine,
    active: herdGroups.active,
  }).from(herdGroups).where(eq(herdGroups.id, groupId)).limit(1);
  return group ?? null;
}

/**
 * Períodos válidos por rotina. Um período pode chegar sozinho (a manhã agora, a
 * tarde depois) e o outro completa o registro no mesmo dia — por isso NÃO
 * exigimos a tarde. Só rejeitamos a tarde num lote que não ordenha à tarde.
 */
export function dailyMilkPeriodError(
  input: Pick<DailyMilkTotalInput, 'afternoonLiters'>,
  group: DailyMilkGroupScope | null,
): string | null {
  if (!group) return null;
  if (!participatesInMilking(group.milkingRoutine)) return 'Este lote não participa da ordenha.';
  if (group.milkingRoutine === 'MORNING_ONLY' && input.afternoonLiters !== null) return 'Este lote possui ordenha somente pela manhã. Deixe a tarde sem valor.';
  return null;
}

export function storedDailyMilk(input: DailyMilkTotalInput) {
  const total = calculateDailyMilkTotal(input.morningLiters, input.afternoonLiters);
  return {
    productionDate: input.productionDate,
    herdGroupId: input.herdGroupId,
    morningLiters: input.morningLiters === null ? null : decimalString(input.morningLiters),
    afternoonLiters: input.afternoonLiters === null ? null : decimalString(input.afternoonLiters),
    totalLiters: decimalString(total),
    notes: input.notes ?? null,
  };
}

export function dailyMilkDuplicateCondition(input: Pick<DailyMilkTotalInput, 'productionDate' | 'herdGroupId'>) {
  return and(
    eq(dailyMilkTotals.productionDate, input.productionDate),
    input.herdGroupId ? eq(dailyMilkTotals.herdGroupId, input.herdGroupId) : isNull(dailyMilkTotals.herdGroupId),
  );
}

export function dailyMilkDuplicateMessage(group: DailyMilkGroupScope | null) {
  return group
    ? `Já existe produção do lote ${group.name} nesta data. Edite o registro existente.`
    : 'Já existe produção do rebanho todo nesta data. Edite o registro existente.';
}

/**
 * Cria ou completa um total diário. Se já existe um registro em (data, escopo),
 * preenche de forma incremental o período que ainda falta (manhã de manhã,
 * tarde à tarde) e recalcula o total. Reenviar um período já preenchido é
 * conflito — o usuário edita o registro. Usado pela rota e pelo commit-registry.
 */
export async function createDailyMilkTotal(input: DailyMilkTotalInput) {
  const group = input.herdGroupId ? await loadDailyMilkGroupScope(input.herdGroupId) : null;
  if (input.herdGroupId && !group) return fail('Lote não encontrado.', 404, 'GROUP_NOT_FOUND');
  if (group && !group.active) return fail('Escolha um lote ativo.', 409, 'GROUP_INACTIVE');
  if (input.morningLiters === null && input.afternoonLiters === null) return fail('Informe a produção da manhã ou da tarde.', 400, 'NO_PERIOD');
  const message = dailyMilkPeriodError(input, group);
  if (message) return fail(message, 400, 'INVALID_MILKING_PERIODS');

  const [existing] = await getDb().select().from(dailyMilkTotals).where(dailyMilkDuplicateCondition(input)).limit(1);
  if (!existing) {
    const [created] = await getDb().insert(dailyMilkTotals).values(storedDailyMilk(input)).returning();
    return created;
  }

  const existingMorning = existing.morningLiters === null ? null : Number(existing.morningLiters);
  const existingAfternoon = existing.afternoonLiters === null ? null : Number(existing.afternoonLiters);
  if (input.morningLiters !== null && existingMorning !== null) return fail('Já existe produção da manhã nesta data. Edite o registro existente.', 409, 'DAILY_TOTAL_EXISTS');
  if (input.afternoonLiters !== null && existingAfternoon !== null) return fail('Já existe produção da tarde nesta data. Edite o registro existente.', 409, 'DAILY_TOTAL_EXISTS');

  const merged: DailyMilkTotalInput = {
    productionDate: input.productionDate,
    herdGroupId: input.herdGroupId,
    morningLiters: input.morningLiters ?? existingMorning,
    afternoonLiters: input.afternoonLiters ?? existingAfternoon,
    notes: input.notes ?? existing.notes,
  };
  const [updated] = await getDb().update(dailyMilkTotals).set({ ...storedDailyMilk(merged), updatedAt: new Date() }).where(eq(dailyMilkTotals.id, existing.id)).returning();
  return updated;
}
