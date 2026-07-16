import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { attachments, dailyMilkTotals, milkCollections } from '../../db/schema.js';
import { resolveDailyMilkDay, type DailyMilkScopeRow } from '../../domain/daily-milk.js';
import { decimalString } from '../../domain/format.js';
import { summarizeMilkDay } from '../../domain/milk-collection.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';

const collectionSources = ['DRIVER_READING', 'TANK_READING', 'RECEIPT', 'OTHER'] as const;
const collectionSchema = z.object({
  collectionDate: z.string().date(),
  collectedAt: z.string().datetime({ offset: true }).nullable().optional(),
  liters: decimalInput.refine((value) => value > 0, 'Informe um volume maior que zero.'),
  source: z.enum(collectionSources).default('TANK_READING'),
  notes: optionalText,
  confirmPossibleDuplicate: z.boolean().optional().default(false),
});

function storedCollection(body: z.output<typeof collectionSchema>) {
  return {
    collectionDate: body.collectionDate,
    collectedAt: body.collectedAt ? new Date(body.collectedAt) : null,
    liters: decimalString(body.liters),
    source: body.source,
    notes: body.notes,
  };
}

function compareDay(dailyRows: DailyMilkScopeRow[], collectionDate: string, liters: Array<string | number>) {
  const production = resolveDailyMilkDay(dailyRows, collectionDate);
  return {
    ...summarizeMilkDay(production?.totalLiters ?? null, liters),
    productionBasis: production?.basis ?? null,
    productionGroupCount: production?.groupCount ?? 0,
  };
}

async function findPossibleDuplicate(collectionDate: string, liters: number, exceptId?: string) {
  const conditions = [eq(milkCollections.collectionDate, collectionDate), eq(milkCollections.liters, decimalString(liters))];
  if (exceptId) conditions.push(ne(milkCollections.id, exceptId));
  const [duplicate] = await getDb().select({ id: milkCollections.id }).from(milkCollections).where(and(...conditions)).limit(1);
  return duplicate;
}

export const milkCollectionRoutes = new Hono()
  .get('/milk-collections', async (c) => {
    const db = getDb();
    const [rows, dailyRows] = await Promise.all([
      db.select().from(milkCollections).orderBy(desc(milkCollections.collectionDate), desc(milkCollections.createdAt)),
      db.select().from(dailyMilkTotals),
    ]);
    return c.json(rows.map((row) => {
      const sameDay = rows.filter((item) => item.collectionDate === row.collectionDate).map((item) => item.liters);
      const comparison = compareDay(dailyRows, row.collectionDate, sameDay);
      return { ...row, dayComparison: comparison };
    }));
  })
  .post('/milk-collections', async (c) => {
    const body = validate(collectionSchema, await readJson(c));
    if (!body.confirmPossibleDuplicate && await findPossibleDuplicate(body.collectionDate, body.liters)) {
      return fail('Já existe uma coleta com a mesma data e volume. Confirme se deseja registrar outra.', 409, 'POSSIBLE_DUPLICATE');
    }
    const [created] = await getDb().insert(milkCollections).values(storedCollection(body)).returning();
    return c.json(created, 201);
  })
  .get('/milk-collections/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb();
    const [collection] = await db.select().from(milkCollections).where(eq(milkCollections.id, id)).limit(1);
    if (!collection) return fail('Coleta não encontrada.', 404, 'NOT_FOUND');
    const [sameDay, production, documents] = await Promise.all([
      db.select().from(milkCollections).where(eq(milkCollections.collectionDate, collection.collectionDate)),
      db.select().from(dailyMilkTotals).where(eq(dailyMilkTotals.productionDate, collection.collectionDate)),
      db.select().from(attachments).where(and(eq(attachments.milkCollectionId, id), isNull(attachments.deletedAt))),
    ]);
    return c.json({ ...collection, attachments: documents, dayComparison: compareDay(production, collection.collectionDate, sameDay.map((row) => row.liters)) });
  })
  .patch('/milk-collections/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(collectionSchema, await readJson(c));
    if (!body.confirmPossibleDuplicate && await findPossibleDuplicate(body.collectionDate, body.liters, id)) {
      return fail('Já existe outra coleta com a mesma data e volume. Confirme se esta alteração está correta.', 409, 'POSSIBLE_DUPLICATE');
    }
    const [updated] = await getDb().update(milkCollections).set({ ...storedCollection(body), updatedAt: new Date() }).where(eq(milkCollections.id, id)).returning();
    if (!updated) return fail('Coleta não encontrada.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .delete('/milk-collections/:id', async (c) => {
    const id = c.req.param('id');
    const [document] = await getDb().select({ id: attachments.id }).from(attachments).where(and(eq(attachments.milkCollectionId, id), isNull(attachments.deletedAt))).limit(1);
    if (document) return fail('Exclua os documentos vinculados antes de excluir a coleta.', 409, 'COLLECTION_HAS_DOCUMENTS');
    const [removed] = await getDb().delete(milkCollections).where(eq(milkCollections.id, id)).returning();
    if (!removed) return fail('Coleta não encontrada.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
