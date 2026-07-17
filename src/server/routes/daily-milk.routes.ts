import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { dailyMilkTotals, herdGroups } from '../../db/schema.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';
import {
  createDailyMilkTotal,
  dailyMilkDuplicateCondition,
  dailyMilkDuplicateMessage,
  dailyMilkPeriodError,
  loadDailyMilkGroupScope,
  storedDailyMilk,
} from '../services/daily-milk.service.js';

const dailyMilkSchema = z.object({
  productionDate: z.string().date(),
  herdGroupId: z.string().uuid().nullable().optional().default(null),
  morningLiters: decimalInput.nullable(),
  afternoonLiters: decimalInput.nullable(),
  notes: optionalText,
}).superRefine((value, context) => {
  if (value.morningLiters === null && value.afternoonLiters === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['morningLiters'], message: 'Informe a produção da manhã ou da tarde.' });
  }
});

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
    const created = await createDailyMilkTotal(body);
    return c.json(created, 201);
  })
  .patch('/daily-milk-totals/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(dailyMilkSchema, await readJson(c));
    const [current] = await getDb().select({ id: dailyMilkTotals.id, herdGroupId: dailyMilkTotals.herdGroupId }).from(dailyMilkTotals).where(eq(dailyMilkTotals.id, id)).limit(1);
    if (!current) return fail('Total diário não encontrado.', 404, 'NOT_FOUND');
    const group = body.herdGroupId ? await loadDailyMilkGroupScope(body.herdGroupId) : null;
    if (body.herdGroupId && !group) return fail('Lote não encontrado.', 404, 'GROUP_NOT_FOUND');
    if (group && !group.active && current.herdGroupId !== group.id) return fail('Escolha um lote ativo.', 409, 'GROUP_INACTIVE');
    const periodError = dailyMilkPeriodError(body, group);
    if (periodError) return fail(periodError, 400, 'INVALID_MILKING_PERIODS');
    const [duplicate] = await getDb().select({ id: dailyMilkTotals.id }).from(dailyMilkTotals).where(dailyMilkDuplicateCondition(body)).limit(1);
    if (duplicate && duplicate.id !== id) return fail(dailyMilkDuplicateMessage(group), 409, 'DAILY_TOTAL_EXISTS');
    const [updated] = await getDb().update(dailyMilkTotals).set({ ...storedDailyMilk(body), updatedAt: new Date() }).where(eq(dailyMilkTotals.id, id)).returning();
    return c.json(updated);
  })
  .delete('/daily-milk-totals/:id', async (c) => {
    const [removed] = await getDb().delete(dailyMilkTotals).where(eq(dailyMilkTotals.id, c.req.param('id'))).returning();
    if (!removed) return fail('Total diário não encontrado.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
