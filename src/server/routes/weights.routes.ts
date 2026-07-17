import { and, asc, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animalAliases, animals, animalWeights, weightSessions } from '../../db/schema.js';
import { decimalString } from '../../domain/format.js';
import { matchAnimalByLabel } from '../../domain/nl/matching.js';
import { parseWeightImport } from '../../domain/weight.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';

const weightStatusSchema = z.enum(['CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED']);
const weightRowSchema = z.object({
  animalId: z.string().uuid().nullable(),
  rawAnimalLabel: z.string().trim().min(1).max(120),
  rawValueText: z.string().trim().max(120).nullable().optional(),
  weightKg: decimalInput.nullable(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  status: weightStatusSchema,
  notes: optionalText,
}).superRefine((value, context) => {
  if (value.status === 'CONFIRMED' && !value.animalId) context.addIssue({ code: 'custom', path: ['animalId'], message: 'Vincule um animal antes de confirmar.' });
  if (value.status === 'CONFIRMED' && value.weightKg === null) context.addIssue({ code: 'custom', path: ['weightKg'], message: 'Informe o peso antes de confirmar.' });
});

const weightSessionCreateSchema = z.object({
  measuredOn: z.string().date(),
  title: z.string().trim().max(160).nullable().optional(),
  notes: optionalText,
  measurements: z.array(weightRowSchema).min(1).max(300),
});

async function loadMatchingContext() {
  const db = getDb();
  const [allAnimals, allAliases, latestWeights] = await Promise.all([
    db.select().from(animals),
    db.select().from(animalAliases),
    db.select({ animalId: animalWeights.animalId, weightKg: animalWeights.weightKg, measuredAt: animalWeights.measuredAt })
      .from(animalWeights).where(and(eq(animalWeights.status, 'CONFIRMED'), isNotNull(animalWeights.animalId), isNotNull(animalWeights.weightKg)))
      .orderBy(desc(animalWeights.measuredAt)),
  ]);
  return { allAnimals, allAliases, latestWeights };
}

export const weightRoutes = new Hono()
  .get('/weight-sessions', async (c) => {
    const rows = await getDb().select({
      id: weightSessions.id,
      measuredOn: weightSessions.measuredOn,
      title: weightSessions.title,
      source: weightSessions.source,
      notes: weightSessions.notes,
      confirmedCount: sql<number>`count(*) filter (where ${animalWeights.status} = 'CONFIRMED')::int`,
      reviewCount: sql<number>`count(*) filter (where ${animalWeights.status} = 'NEEDS_REVIEW')::int`,
      averageWeight: sql<string>`coalesce(avg(${animalWeights.weightKg}) filter (where ${animalWeights.status} = 'CONFIRMED'), 0)`,
    }).from(weightSessions).leftJoin(animalWeights, eq(animalWeights.weightSessionId, weightSessions.id))
      .groupBy(weightSessions.id).orderBy(desc(weightSessions.measuredOn));
    return c.json(rows);
  })
  .post('/weight-sessions/validate', async (c) => {
    const body = validate(z.object({ content: z.string().min(1) }), await readJson(c));
    let parsed;
    try {
      parsed = parseWeightImport(body.content);
    } catch (error) {
      if (error instanceof z.ZodError) return fail(error.issues.map((issue) => issue.message).join('; '));
      return fail(error instanceof Error ? error.message : 'Não foi possível validar as pesagens.');
    }
    const { allAnimals, allAliases, latestWeights } = await loadMatchingContext();
    const seen = new Set<string>();
    const measurements = parsed.measurements.map((row) => {
      const match = matchAnimalByLabel(row.rawAnimalLabel, allAnimals, allAliases);
      const previous = match ? latestWeights.find((weight) => weight.animalId === match.id && weight.weightKg !== null) : undefined;
      const variation = previous && row.weightKg !== null ? ((row.weightKg - Number(previous.weightKg)) / Number(previous.weightKg)) * 100 : null;
      const issues: string[] = [];
      if (!match) issues.push('Animal não encontrado por nome, brinco ou alias exato.');
      if (match && seen.has(match.id)) issues.push('Animal repetido nesta pesagem.');
      if (match) seen.add(match.id);
      if (row.weightKg === null) issues.push('Peso ilegível ou ausente.');
      if (row.confidence === 'LOW') issues.push('Baixa confiança na transcrição.');
      if (variation !== null && Math.abs(variation) >= 12) issues.push(`Variação de ${variation > 0 ? '+' : ''}${variation.toFixed(1).replace('.', ',')}% em relação ao último peso.`);
      if (match && ['SOLD', 'DEAD'].includes(match.status)) issues.push('Animal fora do rebanho atual.');
      const status = row.excluded ? 'EXCLUDED' : issues.length ? 'NEEDS_REVIEW' : 'CONFIRMED';
      return {
        ...row,
        status,
        animalId: match?.id ?? null,
        matchedAnimal: match ? { id: match.id, name: match.name, tagNumber: match.tagNumber, status: match.status } : null,
        previousWeight: previous ? { weightKg: previous.weightKg, measuredAt: previous.measuredAt } : null,
        issues,
      };
    });
    return c.json({ measuredOn: parsed.measuredOn, measurements });
  })
  .post('/weight-sessions', async (c) => {
    const body = validate(weightSessionCreateSchema, await readJson(c));
    const confirmedIds = body.measurements.filter((row) => row.status === 'CONFIRMED').map((row) => row.animalId);
    if (new Set(confirmedIds).size !== confirmedIds.length) return fail('Um animal aparece mais de uma vez entre as linhas confirmadas.', 409, 'DUPLICATE_ANIMAL');
    const [existing] = await getDb().select({ id: weightSessions.id }).from(weightSessions).where(eq(weightSessions.measuredOn, body.measuredOn)).limit(1);
    if (existing) return fail('Já existe uma sessão de pesagem nesta data.', 409, 'DUPLICATE_DATE');
    const session = await getDb().transaction(async (tx) => {
      const [created] = await tx.insert(weightSessions).values({ measuredOn: body.measuredOn, title: body.title || 'Pesagem do rebanho', source: 'IMPORT', notes: body.notes }).returning();
      await tx.insert(animalWeights).values(body.measurements.map((row) => ({
        animalId: row.animalId,
        weightSessionId: created.id,
        measuredAt: new Date(`${body.measuredOn}T12:00:00-03:00`),
        rawAnimalLabel: row.rawAnimalLabel,
        rawValueText: row.rawValueText,
        weightKg: row.weightKg === null ? null : decimalString(row.weightKg),
        confidence: row.confidence,
        status: row.status,
        notes: row.notes,
      })));
      return created;
    });
    return c.json(session, 201);
  })
  .get('/weight-sessions/:id', async (c) => {
    const id = c.req.param('id');
    const [session] = await getDb().select().from(weightSessions).where(eq(weightSessions.id, id)).limit(1);
    if (!session) return fail('Sessão de pesagem não encontrada.', 404, 'NOT_FOUND');
    const measurements = await getDb().select({
      id: animalWeights.id,
      animalId: animalWeights.animalId,
      animalName: animals.name,
      tagNumber: animals.tagNumber,
      rawAnimalLabel: animalWeights.rawAnimalLabel,
      rawValueText: animalWeights.rawValueText,
      weightKg: animalWeights.weightKg,
      confidence: animalWeights.confidence,
      status: animalWeights.status,
      notes: animalWeights.notes,
    }).from(animalWeights).leftJoin(animals, eq(animalWeights.animalId, animals.id))
      .where(eq(animalWeights.weightSessionId, id)).orderBy(asc(animalWeights.createdAt));
    return c.json({ ...session, measurements });
  })
  .patch('/weight-measurements/:id', async (c) => {
    const body = validate(z.object({
      animalId: z.string().uuid().nullable().optional(),
      weightKg: decimalInput.nullable().optional(),
      confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
      status: weightStatusSchema.optional(),
      notes: optionalText,
    }).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.'), await readJson(c));
    const [current] = await getDb().select().from(animalWeights).where(eq(animalWeights.id, c.req.param('id'))).limit(1);
    if (!current) return fail('Pesagem não encontrada.', 404, 'NOT_FOUND');
    const animalId = body.animalId === undefined ? current.animalId : body.animalId;
    const weightKg = body.weightKg === undefined ? current.weightKg : body.weightKg;
    const status = body.status ?? current.status;
    if (status === 'CONFIRMED' && (!animalId || weightKg === null)) return fail('Vincule o animal e informe o peso antes de confirmar.', 400, 'INCOMPLETE_WEIGHT');
    if (status === 'CONFIRMED' && current.weightSessionId && animalId) {
      const [duplicate] = await getDb().select({ id: animalWeights.id }).from(animalWeights).where(and(
        eq(animalWeights.weightSessionId, current.weightSessionId), eq(animalWeights.animalId, animalId), ne(animalWeights.id, current.id), eq(animalWeights.status, 'CONFIRMED'),
      )).limit(1);
      if (duplicate) return fail('Este animal já possui peso confirmado na sessão.', 409, 'DUPLICATE_ANIMAL');
    }
    const values: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.weightKg !== undefined) values.weightKg = body.weightKg === null ? null : decimalString(body.weightKg);
    const [updated] = await getDb().update(animalWeights).set(values).where(eq(animalWeights.id, current.id)).returning();
    return c.json(updated);
  })
  .delete('/weight-sessions/:id', async (c) => {
    const [removed] = await getDb().delete(weightSessions).where(eq(weightSessions.id, c.req.param('id'))).returning();
    if (!removed) return fail('Sessão de pesagem não encontrada.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
