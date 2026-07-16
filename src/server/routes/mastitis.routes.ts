import { asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animals, mastitisActions, mastitisCases } from '../../db/schema.js';
import { mastitisActionTiming, withdrawalState } from '../../domain/mastitis.js';
import { fail } from '../http/api-error.js';
import { optionalText, readJson, validate } from '../http/validation.js';

const statuses = ['OBSERVATION', 'IN_TREATMENT', 'WITHDRAWAL_PERIOD', 'RESOLVED', 'RECURRENT', 'NO_IMPROVEMENT', 'CANCELLED'] as const;
const outcomes = ['RESOLVED', 'IMPROVED', 'RECURRENT', 'NO_IMPROVEMENT', 'ANIMAL_CULLED', 'UNKNOWN'] as const;
const quarters = ['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT', 'MULTIPLE', 'UNKNOWN'] as const;
const detectionMethods = ['VISUAL', 'BLACK_PLATE', 'CMT', 'VETERINARY', 'OTHER', 'UNKNOWN'] as const;

const caseSchema = z.object({
  animalId: z.string().uuid(),
  detectedAt: z.string().datetime({ offset: true }),
  affectedQuarter: z.enum(quarters).nullable().optional(),
  detectionMethod: z.enum(detectionMethods).nullable().optional(),
  observedSigns: optionalText,
  status: z.enum(statuses).default('OBSERVATION'),
  treatmentSummary: optionalText,
  treatmentStartedAt: z.string().datetime({ offset: true }).nullable().optional(),
  treatmentExpectedEndAt: z.string().datetime({ offset: true }).nullable().optional(),
  withdrawalEndsAt: z.string().date().nullable().optional(),
  milkDiscardRequired: z.boolean().default(false),
  outcome: z.enum(outcomes).nullable().optional(),
  notes: optionalText,
  resolvedAt: z.string().datetime({ offset: true }).nullable().optional(),
}).superRefine((value, context) => {
  if (!value.observedSigns && !value.notes) context.addIssue({ code: 'custom', path: ['observedSigns'], message: 'Informe o sinal percebido ou uma observação.' });
  if (value.treatmentExpectedEndAt && value.treatmentStartedAt && value.treatmentExpectedEndAt < value.treatmentStartedAt) {
    context.addIssue({ code: 'custom', path: ['treatmentExpectedEndAt'], message: 'O fim previsto não pode ser anterior ao início.' });
  }
});

function storedCase(body: z.output<typeof caseSchema>) {
  return {
    ...body,
    detectedAt: new Date(body.detectedAt),
    treatmentStartedAt: body.treatmentStartedAt ? new Date(body.treatmentStartedAt) : null,
    treatmentExpectedEndAt: body.treatmentExpectedEndAt ? new Date(body.treatmentExpectedEndAt) : null,
    resolvedAt: body.status === 'RESOLVED' || body.status === 'CANCELLED' ? (body.resolvedAt ? new Date(body.resolvedAt) : new Date()) : null,
  };
}

async function ensureAnimal(animalId: string) {
  const [animal] = await getDb().select({ id: animals.id }).from(animals).where(eq(animals.id, animalId)).limit(1);
  if (!animal) return fail('Animal não encontrado.', 404, 'ANIMAL_NOT_FOUND');
}

export const mastitisRoutes = new Hono()
  .get('/mastitis-cases', async (c) => {
    const db = getDb();
    const [cases, actions] = await Promise.all([
      db.select({
        id: mastitisCases.id, animalId: mastitisCases.animalId, animalName: animals.name, tagNumber: animals.tagNumber,
        detectedAt: mastitisCases.detectedAt, affectedQuarter: mastitisCases.affectedQuarter, detectionMethod: mastitisCases.detectionMethod,
        observedSigns: mastitisCases.observedSigns, status: mastitisCases.status, treatmentSummary: mastitisCases.treatmentSummary,
        treatmentStartedAt: mastitisCases.treatmentStartedAt, treatmentExpectedEndAt: mastitisCases.treatmentExpectedEndAt,
        withdrawalEndsAt: mastitisCases.withdrawalEndsAt, milkDiscardRequired: mastitisCases.milkDiscardRequired,
        outcome: mastitisCases.outcome, notes: mastitisCases.notes, resolvedAt: mastitisCases.resolvedAt,
        createdAt: mastitisCases.createdAt, updatedAt: mastitisCases.updatedAt,
      }).from(mastitisCases).innerJoin(animals, eq(mastitisCases.animalId, animals.id)).orderBy(desc(mastitisCases.detectedAt)),
      db.select().from(mastitisActions).orderBy(asc(mastitisActions.scheduledFor)),
    ]);
    return c.json(cases.map((item) => {
      const caseActions = actions.filter((action) => action.mastitisCaseId === item.id);
      return { ...item, withdrawal: withdrawalState(item.withdrawalEndsAt, item.status), nextAction: caseActions.find((action) => ['OVERDUE', 'TODAY', 'UPCOMING'].includes(mastitisActionTiming(action))) ?? null };
    }));
  })
  .post('/mastitis-cases', async (c) => {
    const body = validate(caseSchema, await readJson(c));
    await ensureAnimal(body.animalId);
    const [created] = await getDb().insert(mastitisCases).values(storedCase(body)).returning();
    return c.json(created, 201);
  })
  .get('/mastitis-cases/:id', async (c) => {
    const id = c.req.param('id');
    const [item] = await getDb().select({
      id: mastitisCases.id, animalId: mastitisCases.animalId, animalName: animals.name, tagNumber: animals.tagNumber,
      detectedAt: mastitisCases.detectedAt, affectedQuarter: mastitisCases.affectedQuarter, detectionMethod: mastitisCases.detectionMethod,
      observedSigns: mastitisCases.observedSigns, status: mastitisCases.status, treatmentSummary: mastitisCases.treatmentSummary,
      treatmentStartedAt: mastitisCases.treatmentStartedAt, treatmentExpectedEndAt: mastitisCases.treatmentExpectedEndAt,
      withdrawalEndsAt: mastitisCases.withdrawalEndsAt, milkDiscardRequired: mastitisCases.milkDiscardRequired,
      outcome: mastitisCases.outcome, notes: mastitisCases.notes, resolvedAt: mastitisCases.resolvedAt,
      createdAt: mastitisCases.createdAt, updatedAt: mastitisCases.updatedAt,
    }).from(mastitisCases).innerJoin(animals, eq(mastitisCases.animalId, animals.id)).where(eq(mastitisCases.id, id)).limit(1);
    if (!item) return fail('Caso de mastite não encontrado.', 404, 'NOT_FOUND');
    const actions = await getDb().select().from(mastitisActions).where(eq(mastitisActions.mastitisCaseId, id)).orderBy(asc(mastitisActions.scheduledFor));
    return c.json({ ...item, withdrawal: withdrawalState(item.withdrawalEndsAt, item.status), actions: actions.map((action) => ({ ...action, timing: mastitisActionTiming(action) })) });
  })
  .patch('/mastitis-cases/:id', async (c) => {
    const body = validate(caseSchema, await readJson(c));
    await ensureAnimal(body.animalId);
    const [updated] = await getDb().update(mastitisCases).set({ ...storedCase(body), updatedAt: new Date() }).where(eq(mastitisCases.id, c.req.param('id'))).returning();
    if (!updated) return fail('Caso de mastite não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .post('/mastitis-cases/:id/actions', async (c) => {
    const mastitisCaseId = c.req.param('id');
    const body = validate(z.object({ scheduledFor: z.string().datetime({ offset: true }), actionDescription: z.string().trim().min(1).max(500) }), await readJson(c));
    const [item] = await getDb().select({ id: mastitisCases.id }).from(mastitisCases).where(eq(mastitisCases.id, mastitisCaseId)).limit(1);
    if (!item) return fail('Caso de mastite não encontrado.', 404, 'NOT_FOUND');
    const [created] = await getDb().insert(mastitisActions).values({ mastitisCaseId, scheduledFor: new Date(body.scheduledFor), actionDescription: body.actionDescription }).returning();
    return c.json(created, 201);
  })
  .patch('/mastitis-actions/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(z.discriminatedUnion('action', [
      z.object({ action: z.literal('edit'), scheduledFor: z.string().datetime({ offset: true }), actionDescription: z.string().trim().min(1).max(500) }),
      z.object({ action: z.literal('complete'), completionNotes: optionalText }),
      z.object({ action: z.literal('undo') }),
      z.object({ action: z.literal('cancel') }),
    ]), await readJson(c));
    const values = body.action === 'edit'
      ? { scheduledFor: new Date(body.scheduledFor), actionDescription: body.actionDescription, updatedAt: new Date() }
      : body.action === 'complete'
        ? { completedAt: new Date(), completionNotes: body.completionNotes, cancelledAt: null, updatedAt: new Date() }
        : body.action === 'undo'
          ? { completedAt: null, completionNotes: null, cancelledAt: null, updatedAt: new Date() }
          : { cancelledAt: new Date(), completedAt: null, updatedAt: new Date() };
    const [updated] = await getDb().update(mastitisActions).set(values).where(eq(mastitisActions.id, id)).returning();
    if (!updated) return fail('Ação não encontrada.', 404, 'NOT_FOUND');
    return c.json(updated);
  });
