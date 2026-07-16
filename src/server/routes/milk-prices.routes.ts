import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { dailyMilkTotals, milkCollections, monthlyMilkPrices } from '../../db/schema.js';
import { summarizeDailyMilk } from '../../domain/daily-milk.js';
import { isMonthKey, monthStorageDate, summarizeMonthlyMilkPrice } from '../../domain/milk-price.js';
import { optionalText, decimalInput, readJson, validate } from '../http/validation.js';

const monthSchema = z.string().refine(isMonthKey, 'Informe o mês no formato AAAA-MM.');
const monthlyMilkPriceSchema = z.object({
  pricePerLiter: decimalInput.refine((value) => value > 0, 'Informe um preço maior que zero.'),
  notes: optionalText,
});

function priceResponse(row: typeof monthlyMilkPrices.$inferSelect) {
  return { ...row, month: row.month.slice(0, 7) };
}

export const milkPriceRoutes = new Hono()
  .get('/milk-prices', async (c) => {
    const rows = await getDb().select().from(monthlyMilkPrices).orderBy(desc(monthlyMilkPrices.month));
    return c.json(rows.map(priceResponse));
  })
  .get('/milk-prices/summary', async (c) => {
    const month = validate(monthSchema, c.req.query('month'));
    const db = getDb();
    const [priceRows, collectionRows, dailyRows] = await Promise.all([
      db.select().from(monthlyMilkPrices).where(eq(monthlyMilkPrices.month, monthStorageDate(month))).limit(1),
      db.select().from(milkCollections),
      db.select().from(dailyMilkTotals),
    ]);
    const price = priceRows[0] ?? null;
    const monthCollections = collectionRows.filter((row) => row.collectionDate.startsWith(month));
    const production = summarizeDailyMilk(dailyRows, month);
    return c.json({
      month,
      price: price ? priceResponse(price) : null,
      collection: summarizeMonthlyMilkPrice(monthCollections, price?.pricePerLiter ?? null),
      production: {
        liters: production.total,
        measuredDays: production.measuredDays,
        averageOnMeasuredDays: production.average,
      },
      limitations: [
        'A estimativa usa somente coletas registradas no mês.',
        'Produção, coleta e receita permanecem fatos independentes.',
        'A estimativa não representa receita recebida nem inclui ajustes do laticínio.',
      ],
    });
  })
  .put('/milk-prices/:month', async (c) => {
    const month = validate(monthSchema, c.req.param('month'));
    const body = validate(monthlyMilkPriceSchema, await readJson(c));
    const stored = {
      month: monthStorageDate(month),
      pricePerLiter: body.pricePerLiter.toFixed(4),
      notes: body.notes,
    };
    const [saved] = await getDb().insert(monthlyMilkPrices).values(stored).onConflictDoUpdate({
      target: monthlyMilkPrices.month,
      set: { pricePerLiter: stored.pricePerLiter, notes: stored.notes, updatedAt: new Date() },
    }).returning();
    return c.json(priceResponse(saved));
  });
