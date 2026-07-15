import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { dailyMilkTotals, milkSessions } from '../../db/schema.js';
import { calculateDailyMilkTotal } from '../../domain/daily-milk.js';
import { decimalString } from '../../domain/format.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';

const dailyMilkSchema = z.object({
  productionDate: z.string().date(),
  morningLiters: decimalInput,
  afternoonLiters: decimalInput,
  notes: optionalText,
});

function storedDailyMilk(body: z.output<typeof dailyMilkSchema>) {
  const totalLiters = calculateDailyMilkTotal(body.morningLiters, body.afternoonLiters);
  return {
    productionDate: body.productionDate,
    morningLiters: decimalString(body.morningLiters),
    afternoonLiters: decimalString(body.afternoonLiters),
    totalLiters: decimalString(totalLiters),
    notes: body.notes,
  };
}

export const dailyMilkRoutes = new Hono()
  .get('/daily-milk-totals', async (c) => c.json(await getDb().select().from(dailyMilkTotals).orderBy(desc(dailyMilkTotals.productionDate))))
  .post('/daily-milk-totals', async (c) => {
    const body = validate(dailyMilkSchema, await readJson(c));
    const [session] = await getDb().select({ id: milkSessions.id }).from(milkSessions).where(eq(milkSessions.sessionDate, body.productionDate)).limit(1);
    if (session) return fail('Esta data já possui um controle individual. O total do dia já é calculado por ele.', 409, 'SESSION_DATE_EXISTS');
    const [duplicate] = await getDb().select({ id: dailyMilkTotals.id }).from(dailyMilkTotals).where(eq(dailyMilkTotals.productionDate, body.productionDate)).limit(1);
    if (duplicate) return fail('Já existe um total de leite nesta data. Edite o registro existente.', 409, 'DAILY_TOTAL_EXISTS');
    const [created] = await getDb().insert(dailyMilkTotals).values(storedDailyMilk(body)).returning();
    return c.json(created, 201);
  })
  .patch('/daily-milk-totals/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(dailyMilkSchema, await readJson(c));
    const [session] = await getDb().select({ id: milkSessions.id }).from(milkSessions).where(eq(milkSessions.sessionDate, body.productionDate)).limit(1);
    if (session) return fail('Esta data já possui um controle individual. O total do dia já é calculado por ele.', 409, 'SESSION_DATE_EXISTS');
    const [duplicate] = await getDb().select({ id: dailyMilkTotals.id }).from(dailyMilkTotals).where(eq(dailyMilkTotals.productionDate, body.productionDate)).limit(1);
    if (duplicate && duplicate.id !== id) return fail('Já existe um total de leite nesta data.', 409, 'DAILY_TOTAL_EXISTS');
    const [updated] = await getDb().update(dailyMilkTotals).set({ ...storedDailyMilk(body), updatedAt: new Date() }).where(eq(dailyMilkTotals.id, id)).returning();
    if (!updated) return fail('Total diário não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .delete('/daily-milk-totals/:id', async (c) => {
    const [removed] = await getDb().delete(dailyMilkTotals).where(eq(dailyMilkTotals.id, c.req.param('id'))).returning();
    if (!removed) return fail('Total diário não encontrado.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
