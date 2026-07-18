import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { feedItems, feedPurchaseEntries, feedingEventItems, feedingEvents, herdGroups, purchases } from '../../db/schema.js';
import { linesBeyondBalance } from '../../domain/feeding.js';
import { GUARDRAILS } from '../../domain/guardrails.js';
import { fail } from '../http/api-error.js';
import { loadFeedInventory } from '../services/feed-inventory.js';
import { optionalText, readJson, validate } from '../http/validation.js';

const unitSchema = z.enum(['KG', 'LITER', 'UNIT']);
const contextSchema = z.enum(['MILKING', 'PASTURE', 'STATION']);
const quantitySchema = z.number().positive('Informe uma quantidade maior que zero.').max(GUARDRAILS.feedQuantity.max);

const feedItemSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do item.').max(120),
  canonicalUnit: unitSchema,
  active: z.boolean().optional().default(true),
});

const purchaseEntrySchema = z.object({
  feedItemId: z.string().uuid(),
  purchaseId: z.string().uuid(),
  quantity: quantitySchema,
  notes: optionalText,
});

const feedingEventSchema = z.object({
  date: z.string().date(),
  context: contextSchema,
  herdGroupId: z.string().uuid().nullable().optional().default(null),
  notes: optionalText,
  items: z.array(z.object({ feedItemId: z.string().uuid(), quantity: quantitySchema }))
    .min(1, 'Adicione pelo menos um item.'),
  confirmBeyondBalance: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  for (const item of value.items) {
    if (seen.has(item.feedItemId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'O mesmo item aparece em mais de uma linha; some as quantidades.' });
      return;
    }
    seen.add(item.feedItemId);
  }
});

export const feedingRoutes = new Hono()
  .get('/feed-items', async (c) => {
    const rows = await getDb().select().from(feedItems).orderBy(asc(feedItems.name));
    return c.json(rows);
  })
  .post('/feed-items', async (c) => {
    const body = validate(feedItemSchema, await readJson(c));
    try {
      const [created] = await getDb().insert(feedItems).values(body).returning();
      return c.json(created, 201);
    } catch {
      return fail('Já existe um item com este nome.', 409, 'DUPLICATE_FEED_ITEM');
    }
  })
  .patch('/feed-items/:id', async (c) => {
    const body = validate(feedItemSchema.partial(), await readJson(c));
    let updated: typeof feedItems.$inferSelect | undefined;
    try {
      [updated] = await getDb().update(feedItems).set({ ...body, updatedAt: new Date() })
        .where(eq(feedItems.id, c.req.param('id'))).returning();
    } catch {
      return fail('Já existe um item com este nome.', 409, 'DUPLICATE_FEED_ITEM');
    }
    if (!updated) return fail('Item não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .get('/feed-inventory', async (c) => {
    const [items, inventory] = await Promise.all([
      getDb().select().from(feedItems).orderBy(asc(feedItems.name)),
      loadFeedInventory(),
    ]);
    const byItem = new Map(inventory.map((line) => [line.feedItemId, line]));
    return c.json(items.map((item) => {
      const line = byItem.get(item.id);
      return {
        feedItemId: item.id,
        name: item.name,
        canonicalUnit: item.canonicalUnit,
        active: item.active,
        purchasedQuantity: line?.purchasedQuantity ?? 0,
        consumedQuantity: line?.consumedQuantity ?? 0,
        balance: line?.balance ?? 0,
      };
    }));
  })
  .get('/feed-purchase-entries', async (c) => {
    const purchaseId = c.req.query('purchaseId');
    const rows = await getDb().select({
      id: feedPurchaseEntries.id,
      feedItemId: feedPurchaseEntries.feedItemId,
      feedItemName: feedItems.name,
      canonicalUnit: feedItems.canonicalUnit,
      purchaseId: feedPurchaseEntries.purchaseId,
      purchaseDescription: purchases.description,
      purchaseDate: purchases.purchaseDate,
      purchaseStatus: purchases.status,
      quantity: feedPurchaseEntries.quantity,
      notes: feedPurchaseEntries.notes,
      createdAt: feedPurchaseEntries.createdAt,
    }).from(feedPurchaseEntries)
      .innerJoin(feedItems, eq(feedPurchaseEntries.feedItemId, feedItems.id))
      .innerJoin(purchases, eq(feedPurchaseEntries.purchaseId, purchases.id))
      .where(purchaseId ? eq(feedPurchaseEntries.purchaseId, purchaseId) : undefined)
      .orderBy(desc(feedPurchaseEntries.createdAt));
    return c.json(rows);
  })
  .post('/feed-purchase-entries', async (c) => {
    const body = validate(purchaseEntrySchema, await readJson(c));
    const db = getDb();
    const [item] = await db.select().from(feedItems).where(eq(feedItems.id, body.feedItemId)).limit(1);
    if (!item) return fail('Item do catálogo não encontrado.', 404, 'FEED_ITEM_NOT_FOUND');
    if (!item.active) return fail('Este item está inativo no catálogo.', 409, 'FEED_ITEM_INACTIVE');
    const [purchase] = await db.select({ id: purchases.id, status: purchases.status }).from(purchases).where(eq(purchases.id, body.purchaseId)).limit(1);
    if (!purchase) return fail('Compra não encontrada.', 404, 'PURCHASE_NOT_FOUND');
    if (purchase.status === 'CANCELLED') return fail('Compra cancelada não credita o estoque.', 409, 'PURCHASE_CANCELLED');
    const [created] = await db.insert(feedPurchaseEntries).values({
      feedItemId: body.feedItemId,
      purchaseId: body.purchaseId,
      quantity: body.quantity.toFixed(3),
      notes: body.notes,
    }).returning();
    return c.json(created, 201);
  })
  .delete('/feed-purchase-entries/:id', async (c) => {
    const [removed] = await getDb().delete(feedPurchaseEntries).where(eq(feedPurchaseEntries.id, c.req.param('id'))).returning();
    if (!removed) return fail('Entrada não encontrada.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  })
  .get('/feeding-events', async (c) => {
    const db = getDb();
    const events = await db.select({
      id: feedingEvents.id,
      date: feedingEvents.date,
      context: feedingEvents.context,
      herdGroupId: feedingEvents.herdGroupId,
      herdGroupName: herdGroups.name,
      notes: feedingEvents.notes,
      createdAt: feedingEvents.createdAt,
    }).from(feedingEvents).leftJoin(herdGroups, eq(feedingEvents.herdGroupId, herdGroups.id))
      .orderBy(desc(feedingEvents.date), desc(feedingEvents.createdAt)).limit(200);
    const ids = events.map((event) => event.id);
    const items = ids.length
      ? await db.select({
        id: feedingEventItems.id,
        feedingEventId: feedingEventItems.feedingEventId,
        feedItemId: feedingEventItems.feedItemId,
        feedItemName: feedItems.name,
        canonicalUnit: feedItems.canonicalUnit,
        quantity: feedingEventItems.quantity,
      }).from(feedingEventItems).innerJoin(feedItems, eq(feedingEventItems.feedItemId, feedItems.id))
        .where(inArray(feedingEventItems.feedingEventId, ids))
      : [];
    const byEvent = new Map<string, typeof items>();
    for (const item of items) {
      const list = byEvent.get(item.feedingEventId) ?? [];
      list.push(item);
      byEvent.set(item.feedingEventId, list);
    }
    return c.json(events.map((event) => ({ ...event, items: byEvent.get(event.id) ?? [] })));
  })
  .post('/feeding-events', async (c) => {
    const body = validate(feedingEventSchema, await readJson(c));
    const db = getDb();

    if (body.context === 'MILKING' && !body.herdGroupId) {
      return fail('Selecione o lote que recebeu o trato da ordenha.', 400, 'GROUP_REQUIRED');
    }
    if (body.herdGroupId) {
      const [group] = await db.select({ id: herdGroups.id, milkingRoutine: herdGroups.milkingRoutine })
        .from(herdGroups).where(eq(herdGroups.id, body.herdGroupId)).limit(1);
      if (!group) return fail('Lote não encontrado.', 404, 'GROUP_NOT_FOUND');
      if (body.context === 'MILKING' && group.milkingRoutine === 'NOT_MILKED') {
        return fail('Este lote não participa da ordenha.', 400, 'GROUP_NOT_MILKED');
      }
    }

    const itemIds = body.items.map((item) => item.feedItemId);
    const knownItems = await db.select().from(feedItems).where(inArray(feedItems.id, itemIds));
    const knownById = new Map(knownItems.map((item) => [item.id, item]));
    for (const item of body.items) {
      const known = knownById.get(item.feedItemId);
      if (!known) return fail('Item do catálogo não encontrado.', 404, 'FEED_ITEM_NOT_FOUND');
      if (!known.active) return fail(`O item “${known.name}” está inativo no catálogo.`, 409, 'FEED_ITEM_INACTIVE');
    }

    // Consumo acima do saldo derivado: avisa e pede confirmação explícita —
    // não bloqueia, porque o histórico de compras pode estar incompleto.
    if (!body.confirmBeyondBalance) {
      const inventory = await loadFeedInventory();
      const beyond = linesBeyondBalance(body.items, inventory);
      if (beyond.length) {
        const detail = beyond
          .map((line) => `${knownById.get(line.feedItemId)?.name ?? 'item'} (saldo ${line.balance}, uso ${line.quantity})`)
          .join('; ');
        return fail(`Uso acima do saldo em estoque: ${detail}. Confirme se o histórico de compras está incompleto.`, 409, 'BEYOND_BALANCE');
      }
    }

    const created = await db.transaction(async (tx) => {
      const [event] = await tx.insert(feedingEvents).values({
        date: body.date,
        context: body.context,
        herdGroupId: body.herdGroupId,
        notes: body.notes,
      }).returning();
      const eventItems = await tx.insert(feedingEventItems).values(body.items.map((item) => ({
        feedingEventId: event.id,
        feedItemId: item.feedItemId,
        quantity: item.quantity.toFixed(3),
      }))).returning();
      return { ...event, items: eventItems };
    });
    return c.json(created, 201);
  })
  .delete('/feeding-events/:id', async (c) => {
    const [removed] = await getDb().delete(feedingEvents).where(eq(feedingEvents.id, c.req.param('id'))).returning();
    if (!removed) return fail('Trato não encontrado.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
