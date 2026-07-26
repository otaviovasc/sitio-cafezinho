import { asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { purchases, suppliers } from '../../db/schema.js';
import { normalizeLabel } from '../../domain/format.js';
import { fail } from '../http/api-error.js';
import { optionalText, readJson, validate } from '../http/validation.js';

const supplierSchema = z.object({ name: z.string().trim().min(1).max(160), notes: optionalText });

export const supplierRoutes = new Hono()
  .get('/suppliers', async (c) => c.json(await getDb().select().from(suppliers).orderBy(asc(suppliers.name))))
  .post('/suppliers', async (c) => {
    const body = validate(supplierSchema, await readJson(c));
    const existing = await getDb().select({ name: suppliers.name }).from(suppliers);
    if (existing.some((supplier) => normalizeLabel(supplier.name) === normalizeLabel(body.name))) {
      return fail('Já existe um fornecedor com este nome.', 409, 'DUPLICATE_SUPPLIER');
    }
    const [created] = await getDb().insert(suppliers).values(body).returning();
    return c.json(created, 201);
  })
  .get('/suppliers/:id', async (c) => {
    const id = c.req.param('id');
    const [supplier] = await getDb().select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!supplier) return fail('Fornecedor não encontrado.', 404, 'NOT_FOUND');
    const supplierPurchases = await getDb().select().from(purchases).where(eq(purchases.supplierId, id)).orderBy(desc(purchases.purchaseDate));
    return c.json({ ...supplier, purchases: supplierPurchases });
  })
  .patch('/suppliers/:id', async (c) => {
    const body = validate(supplierSchema, await readJson(c));
    const id = c.req.param('id');
    const existing = await getDb().select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
    if (existing.some((supplier) => supplier.id !== id && normalizeLabel(supplier.name) === normalizeLabel(body.name))) {
      return fail('Já existe um fornecedor com este nome.', 409, 'DUPLICATE_SUPPLIER');
    }
    const [updated] = await getDb().update(suppliers).set({ ...body, updatedAt: new Date() }).where(eq(suppliers.id, id)).returning();
    if (!updated) return fail('Fornecedor não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  });
