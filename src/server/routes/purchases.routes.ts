import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { attachments, purchaseItems, purchases, suppliers } from '../../db/schema.js';
import { decimalString } from '../../domain/format.js';
import { isOverdue } from '../../domain/purchases.js';
import { fail } from '../http/api-error.js';
import { readJson, validate } from '../http/validation.js';
import { itemSchema, purchaseSchema } from './purchase.schemas.js';

function purchaseValues(body: z.output<typeof purchaseSchema>) {
  return {
    ...body,
    grossAmount: decimalString(body.grossAmount ?? body.totalAmount),
    discountAmount: decimalString(body.discountAmount ?? 0),
    freightAmount: decimalString(body.freightAmount ?? 0),
    totalAmount: decimalString(body.totalAmount),
    paidAt: body.status === 'PAID' ? new Date() : null,
  };
}

export const purchaseRoutes = new Hono()
  .get('/purchases', async (c) => {
    const filter = c.req.query('status');
    const rows = await getDb().select({
      id: purchases.id,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      purchaseDate: purchases.purchaseDate,
      description: purchases.description,
      category: purchases.category,
      totalAmount: purchases.totalAmount,
      dueDate: purchases.dueDate,
      paidAt: purchases.paidAt,
      status: purchases.status,
      notes: purchases.notes,
    }).from(purchases).leftJoin(suppliers, eq(purchases.supplierId, suppliers.id)).orderBy(desc(purchases.purchaseDate));
    const enhanced = rows.map((row) => ({ ...row, isOverdue: isOverdue(row) }));
    const filtered = filter === 'OVERDUE' ? enhanced.filter((row) => row.isOverdue)
      : filter && ['OPEN', 'PAID', 'CANCELLED'].includes(filter) ? enhanced.filter((row) => row.status === filter)
      : enhanced;
    return c.json(filtered);
  })
  .post('/purchases', async (c) => {
    const body = validate(purchaseSchema, await readJson(c));
    const [created] = await getDb().insert(purchases).values(purchaseValues(body)).returning();
    return c.json(created, 201);
  })
  .get('/purchases/:id', async (c) => {
    const id = c.req.param('id');
    const [purchase] = await getDb().select({
      id: purchases.id,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      purchaseDate: purchases.purchaseDate,
      description: purchases.description,
      category: purchases.category,
      grossAmount: purchases.grossAmount,
      discountAmount: purchases.discountAmount,
      freightAmount: purchases.freightAmount,
      totalAmount: purchases.totalAmount,
      dueDate: purchases.dueDate,
      paidAt: purchases.paidAt,
      status: purchases.status,
      notes: purchases.notes,
    }).from(purchases).leftJoin(suppliers, eq(purchases.supplierId, suppliers.id)).where(eq(purchases.id, id)).limit(1);
    if (!purchase) return fail('Compra não encontrada.', 404, 'NOT_FOUND');
    const items = await getDb().select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    const documents = await getDb().select().from(attachments).where(and(eq(attachments.purchaseId, id), isNull(attachments.deletedAt)));
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    return c.json({ ...purchase, isOverdue: isOverdue(purchase), items, attachments: documents, itemsTotal, itemsDifference: Math.round((itemsTotal - Number(purchase.totalAmount)) * 100) / 100 });
  })
  .patch('/purchases/:id', async (c) => {
    const id = c.req.param('id');
    const raw = await readJson(c);
    const action = z.object({ action: z.enum(['pay', 'reopen', 'cancel']) }).safeParse(raw);
    const values = action.success
      ? action.data.action === 'pay' ? { status: 'PAID' as const, paidAt: new Date() }
        : action.data.action === 'reopen' ? { status: 'OPEN' as const, paidAt: null }
        : { status: 'CANCELLED' as const, paidAt: null }
      : purchaseValues(validate(purchaseSchema, raw));
    const [updated] = await getDb().update(purchases).set({ ...values, updatedAt: new Date() }).where(eq(purchases.id, id)).returning();
    if (!updated) return fail('Compra não encontrada.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .post('/purchases/:id/items', async (c) => {
    const body = validate(itemSchema, await readJson(c));
    const [created] = await getDb().insert(purchaseItems).values({
      purchaseId: c.req.param('id'),
      ...body,
      quantity: body.quantity.toFixed(3),
      unitPrice: decimalString(body.unitPrice),
      totalPrice: decimalString(body.totalPrice),
    }).returning();
    return c.json(created, 201);
  })
  .patch('/purchase-items/:id', async (c) => {
    const body = validate(itemSchema, await readJson(c));
    const [updated] = await getDb().update(purchaseItems).set({ ...body, quantity: body.quantity.toFixed(3), unitPrice: decimalString(body.unitPrice), totalPrice: decimalString(body.totalPrice) }).where(eq(purchaseItems.id, c.req.param('id'))).returning();
    if (!updated) return fail('Item não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .delete('/purchase-items/:id', async (c) => {
    const [removed] = await getDb().delete(purchaseItems).where(eq(purchaseItems.id, c.req.param('id'))).returning();
    if (!removed) return fail('Item não encontrado.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
