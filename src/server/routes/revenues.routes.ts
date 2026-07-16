import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animals, attachments, purchases, revenues } from '../../db/schema.js';
import { summarizeRegisteredCash } from '../../domain/finance.js';
import { decimalString } from '../../domain/format.js';
import { isOverdue } from '../../domain/purchases.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';

const revenueCategories = ['MILK_SALE', 'CALF_SALE', 'CULL_SALE', 'ANIMAL_SALE', 'OTHER'] as const;
const revenueStatuses = ['EXPECTED', 'RECEIVED', 'CANCELLED'] as const;
const revenueActionSchema = z.object({ action: z.enum(['receive', 'expect', 'cancel']) });
const optionalDecimal = z.union([z.string(), z.number(), z.null()]).optional().transform((value, context): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) { context.addIssue({ code: 'custom', message: 'Use um número maior ou igual a zero.' }); return null; }
  return parsed;
});
const revenueSchema = z.object({
  revenueDate: z.string().date(),
  category: z.enum(revenueCategories),
  description: z.string().trim().min(1).max(300),
  amount: decimalInput.refine((value) => value > 0, 'Informe um valor maior que zero.'),
  status: z.enum(revenueStatuses),
  receivedAt: z.string().datetime({ offset: true }).nullable().optional(),
  animalId: z.string().uuid().nullable().optional(),
  periodStart: z.string().date().nullable().optional(),
  periodEnd: z.string().date().nullable().optional(),
  quantity: optionalDecimal,
  unitPrice: optionalDecimal,
  bonusAmount: optionalDecimal,
  discountAmount: optionalDecimal,
  buyerName: optionalText,
  notes: optionalText,
}).superRefine((value, context) => {
  if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'O fim do período não pode ser anterior ao início.' });
});

function storedRevenue(body: z.output<typeof revenueSchema>) {
  return {
    ...body,
    amount: decimalString(body.amount),
    receivedAt: body.status === 'RECEIVED' ? (body.receivedAt ? new Date(body.receivedAt) : new Date()) : null,
    quantity: body.quantity === null ? null : body.quantity.toFixed(3),
    unitPrice: body.unitPrice === null ? null : body.unitPrice.toFixed(4),
    bonusAmount: decimalString(body.bonusAmount ?? 0),
    discountAmount: decimalString(body.discountAmount ?? 0),
  };
}

export const revenueRoutes = new Hono()
  .get('/revenues', async (c) => c.json(await getDb().select({
    id: revenues.id, revenueDate: revenues.revenueDate, category: revenues.category, description: revenues.description,
    amount: revenues.amount, status: revenues.status, receivedAt: revenues.receivedAt, animalId: revenues.animalId,
    animalName: animals.name, tagNumber: animals.tagNumber, buyerName: revenues.buyerName, notes: revenues.notes,
  }).from(revenues).leftJoin(animals, eq(revenues.animalId, animals.id)).orderBy(desc(revenues.revenueDate), desc(revenues.createdAt))))
  .post('/revenues', async (c) => {
    const body = validate(revenueSchema, await readJson(c));
    if (body.animalId) {
      const [animal] = await getDb().select({ id: animals.id }).from(animals).where(eq(animals.id, body.animalId)).limit(1);
      if (!animal) return fail('Animal não encontrado.', 404, 'ANIMAL_NOT_FOUND');
    }
    const [created] = await getDb().insert(revenues).values(storedRevenue(body)).returning();
    return c.json(created, 201);
  })
  .get('/revenues/:id', async (c) => {
    const id = c.req.param('id');
    const [revenue] = await getDb().select({
      id: revenues.id, revenueDate: revenues.revenueDate, category: revenues.category, description: revenues.description,
      amount: revenues.amount, status: revenues.status, receivedAt: revenues.receivedAt, animalId: revenues.animalId,
      animalName: animals.name, tagNumber: animals.tagNumber, periodStart: revenues.periodStart, periodEnd: revenues.periodEnd,
      quantity: revenues.quantity, unitPrice: revenues.unitPrice, bonusAmount: revenues.bonusAmount, discountAmount: revenues.discountAmount,
      buyerName: revenues.buyerName, notes: revenues.notes,
    }).from(revenues).leftJoin(animals, eq(revenues.animalId, animals.id)).where(eq(revenues.id, id)).limit(1);
    if (!revenue) return fail('Receita não encontrada.', 404, 'NOT_FOUND');
    const documents = await getDb().select().from(attachments).where(and(eq(attachments.revenueId, id), isNull(attachments.deletedAt)));
    return c.json({ ...revenue, attachments: documents });
  })
  .patch('/revenues/:id', async (c) => {
    const body = validate(revenueSchema, await readJson(c));
    const [updated] = await getDb().update(revenues).set({ ...storedRevenue(body), updatedAt: new Date() }).where(eq(revenues.id, c.req.param('id'))).returning();
    if (!updated) return fail('Receita não encontrada.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .post('/revenues/:id/actions', async (c) => {
    const { action } = validate(revenueActionSchema, await readJson(c));
    const values = action === 'receive'
      ? { status: 'RECEIVED' as const, receivedAt: new Date() }
      : action === 'cancel'
        ? { status: 'CANCELLED' as const, receivedAt: null }
        : { status: 'EXPECTED' as const, receivedAt: null };
    const [updated] = await getDb().update(revenues).set({ ...values, updatedAt: new Date() }).where(eq(revenues.id, c.req.param('id'))).returning();
    if (!updated) return fail('Receita não encontrada.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .get('/finance-summary', async (c) => {
    const month = c.req.query('month');
    const [revenueRows, purchaseRows] = await Promise.all([
      getDb().select().from(revenues),
      getDb().select().from(purchases),
    ]);
    const selectedRevenues = month ? revenueRows.filter((row) => row.revenueDate.startsWith(month)) : revenueRows;
    const selectedPurchases = month ? purchaseRows.filter((row) => row.purchaseDate.startsWith(month)) : purchaseRows;
    const summary = summarizeRegisteredCash(selectedRevenues, selectedPurchases);
    const overdueRows = selectedPurchases.filter((row) => isOverdue(row));
    return c.json({ ...summary, overdue: overdueRows.reduce((sum, row) => sum + Number(row.totalAmount), 0), overdueCount: overdueRows.length });
  });
