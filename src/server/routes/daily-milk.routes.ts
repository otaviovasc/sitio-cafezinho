import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { dailyMilkTotals, herdGroups } from '../../db/schema.js';
import { calculateDailyMilkTotal } from '../../domain/daily-milk.js';
import { decimalString } from '../../domain/format.js';
import { participatesInMilking } from '../../domain/herd.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';

const dailyMilkSchema = z.object({
  productionDate: z.string().date(),
  herdGroupId: z.string().uuid().nullable().optional().default(null),
  morningLiters: decimalInput,
  afternoonLiters: decimalInput.nullable(),
  notes: optionalText,
}).superRefine((value, context) => {
  if (!value.herdGroupId && value.afternoonLiters === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['afternoonLiters'], message: 'Informe a produção da tarde para o total do rebanho.' });
  }
});

type DailyMilkBody = z.output<typeof dailyMilkSchema>;
type GroupScope = { id: string; name: string; milkingRoutine: 'MORNING_AND_AFTERNOON' | 'MORNING_ONLY' | 'NOT_MILKED'; active: boolean };

function storedDailyMilk(body: DailyMilkBody) {
  const totalLiters = calculateDailyMilkTotal(body.morningLiters, body.afternoonLiters);
  return {
    productionDate: body.productionDate,
    herdGroupId: body.herdGroupId,
    morningLiters: decimalString(body.morningLiters),
    afternoonLiters: body.afternoonLiters === null ? null : decimalString(body.afternoonLiters),
    totalLiters: decimalString(totalLiters),
    notes: body.notes,
  };
}

async function loadGroupScope(groupId: string) {
  const [group] = await getDb().select({
    id: herdGroups.id,
    name: herdGroups.name,
    milkingRoutine: herdGroups.milkingRoutine,
    active: herdGroups.active,
  }).from(herdGroups).where(eq(herdGroups.id, groupId)).limit(1);
  return group ?? null;
}

function invalidPeriodMessage(body: DailyMilkBody, group: GroupScope | null) {
  if (!group) return null;
  if (!participatesInMilking(group.milkingRoutine)) return 'Este lote não participa da ordenha.';
  if (group.milkingRoutine === 'MORNING_ONLY' && body.afternoonLiters !== null) return 'Este lote possui ordenha somente pela manhã. Deixe a tarde sem valor.';
  if (group.milkingRoutine === 'MORNING_AND_AFTERNOON' && body.afternoonLiters === null) return 'Informe a produção da tarde para este lote.';
  return null;
}

function duplicateCondition(body: DailyMilkBody) {
  return and(
    eq(dailyMilkTotals.productionDate, body.productionDate),
    body.herdGroupId ? eq(dailyMilkTotals.herdGroupId, body.herdGroupId) : isNull(dailyMilkTotals.herdGroupId),
  );
}

function duplicateMessage(group: GroupScope | null) {
  return group
    ? `Já existe produção do lote ${group.name} nesta data. Edite o registro existente.`
    : 'Já existe produção do rebanho todo nesta data. Edite o registro existente.';
}

export const dailyMilkRoutes = new Hono()
  .get('/daily-milk-totals', async (c) => {
    const rows = await getDb().select({
      id: dailyMilkTotals.id,
      productionDate: dailyMilkTotals.productionDate,
      herdGroupId: dailyMilkTotals.herdGroupId,
      herdGroupName: herdGroups.name,
      milkingRoutine: herdGroups.milkingRoutine,
      morningLiters: dailyMilkTotals.morningLiters,
      afternoonLiters: dailyMilkTotals.afternoonLiters,
      totalLiters: dailyMilkTotals.totalLiters,
      notes: dailyMilkTotals.notes,
      createdAt: dailyMilkTotals.createdAt,
      updatedAt: dailyMilkTotals.updatedAt,
    }).from(dailyMilkTotals).leftJoin(herdGroups, eq(dailyMilkTotals.herdGroupId, herdGroups.id))
      .orderBy(desc(dailyMilkTotals.productionDate), desc(dailyMilkTotals.createdAt));
    return c.json(rows);
  })
  .post('/daily-milk-totals', async (c) => {
    const body = validate(dailyMilkSchema, await readJson(c));
    const group = body.herdGroupId ? await loadGroupScope(body.herdGroupId) : null;
    if (body.herdGroupId && !group) return fail('Lote não encontrado.', 404, 'GROUP_NOT_FOUND');
    if (group && !group.active) return fail('Escolha um lote ativo.', 409, 'GROUP_INACTIVE');
    const periodError = invalidPeriodMessage(body, group);
    if (periodError) return fail(periodError, 400, 'INVALID_MILKING_PERIODS');
    const [duplicate] = await getDb().select({ id: dailyMilkTotals.id }).from(dailyMilkTotals).where(duplicateCondition(body)).limit(1);
    if (duplicate) return fail(duplicateMessage(group), 409, 'DAILY_TOTAL_EXISTS');
    const [created] = await getDb().insert(dailyMilkTotals).values(storedDailyMilk(body)).returning();
    return c.json(created, 201);
  })
  .patch('/daily-milk-totals/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(dailyMilkSchema, await readJson(c));
    const [current] = await getDb().select({ id: dailyMilkTotals.id, herdGroupId: dailyMilkTotals.herdGroupId }).from(dailyMilkTotals).where(eq(dailyMilkTotals.id, id)).limit(1);
    if (!current) return fail('Total diário não encontrado.', 404, 'NOT_FOUND');
    const group = body.herdGroupId ? await loadGroupScope(body.herdGroupId) : null;
    if (body.herdGroupId && !group) return fail('Lote não encontrado.', 404, 'GROUP_NOT_FOUND');
    if (group && !group.active && current.herdGroupId !== group.id) return fail('Escolha um lote ativo.', 409, 'GROUP_INACTIVE');
    const periodError = invalidPeriodMessage(body, group);
    if (periodError) return fail(periodError, 400, 'INVALID_MILKING_PERIODS');
    const [duplicate] = await getDb().select({ id: dailyMilkTotals.id }).from(dailyMilkTotals).where(duplicateCondition(body)).limit(1);
    if (duplicate && duplicate.id !== id) return fail(duplicateMessage(group), 409, 'DAILY_TOTAL_EXISTS');
    const [updated] = await getDb().update(dailyMilkTotals).set({ ...storedDailyMilk(body), updatedAt: new Date() }).where(eq(dailyMilkTotals.id, id)).returning();
    return c.json(updated);
  })
  .delete('/daily-milk-totals/:id', async (c) => {
    const [removed] = await getDb().delete(dailyMilkTotals).where(eq(dailyMilkTotals.id, c.req.param('id'))).returning();
    if (!removed) return fail('Total diário não encontrado.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
