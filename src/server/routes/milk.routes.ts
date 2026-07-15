import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animalAliases, animals, attachments, dailyMilkTotals, milkMeasurements, milkSessions } from '../../db/schema.js';
import { decimalString, normalizeLabel } from '../../domain/format.js';
import { parseChatGptImport } from '../../domain/import.js';
import { estimateSplit } from '../../domain/milk.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';
import { createMilkSession, loadMilkingHerdOnDate } from '../services/milk-session.service.js';

const measurementBaseSchema = z.object({
  animalId: z.string().uuid().nullable().optional(),
  rawAnimalLabel: z.string().trim().min(1).max(120),
  rawValueText: z.string().max(120).nullable().optional(),
  morningLiters: decimalInput.nullable().optional(),
  afternoonLiters: decimalInput.nullable().optional(),
  totalLiters: decimalInput,
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('HIGH'),
  status: z.enum(['CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED']).default('CONFIRMED'),
  notes: optionalText,
});

const measurementSchema = measurementBaseSchema.superRefine((value, context) => {
  if (value.morningLiters != null || value.afternoonLiters != null) {
    const sum = (value.morningLiters ?? 0) + (value.afternoonLiters ?? 0);
    if (Math.abs(sum - value.totalLiters) > 0.011) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Manhã + tarde deve ser igual ao total.' });
  }
});

const measurementUpdateSchema = z.object({
  animalId: z.string().uuid().nullable().optional(),
  morningLiters: decimalInput.nullable().optional(),
  afternoonLiters: decimalInput.nullable().optional(),
  totalLiters: decimalInput.optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  status: z.enum(['CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED']).optional(),
  notes: optionalText,
}).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');

const sessionSchema = z.object({
  sessionDate: z.string().date(),
  title: z.string().trim().max(160).nullable().optional().transform((value) => value || null),
  inputMode: z.enum(['SEPARATE_MORNING_AFTERNOON', 'COMBINED_TOTAL', 'MIXED']),
  notes: optionalText,
  measurements: z.array(measurementSchema).min(1, 'Preencha ao menos um animal.'),
});

export const milkRoutes = new Hono()
  .get('/milk-sessions', async (c) => {
    const rows = await getDb().select({
      id: milkSessions.id,
      sessionDate: milkSessions.sessionDate,
      title: milkSessions.title,
      inputMode: milkSessions.inputMode,
      source: milkSessions.source,
      notes: milkSessions.notes,
      confirmedTotal: sql<string>`coalesce(sum(case when ${milkMeasurements.status} = 'CONFIRMED' then ${milkMeasurements.totalLiters} else 0 end), 0)`,
      confirmedCount: sql<number>`count(*) filter (where ${milkMeasurements.status} = 'CONFIRMED')::int`,
      reviewCount: sql<number>`count(*) filter (where ${milkMeasurements.status} = 'NEEDS_REVIEW')::int`,
    }).from(milkSessions).leftJoin(milkMeasurements, eq(milkMeasurements.milkSessionId, milkSessions.id))
      .groupBy(milkSessions.id).orderBy(desc(milkSessions.sessionDate), desc(milkSessions.createdAt));
    return c.json(rows);
  })
  .get('/milk-production-timeline', async (c) => {
    const daily = await getDb().select().from(dailyMilkTotals).orderBy(asc(dailyMilkTotals.productionDate));
    const sessions = await getDb().select({
      id: milkSessions.id,
      date: milkSessions.sessionDate,
      totalLiters: sql<string>`coalesce(sum(case when ${milkMeasurements.status} = 'CONFIRMED' then ${milkMeasurements.totalLiters} else 0 end), 0)`,
    }).from(milkSessions).leftJoin(milkMeasurements, eq(milkMeasurements.milkSessionId, milkSessions.id))
      .groupBy(milkSessions.id).orderBy(asc(milkSessions.sessionDate));
    return c.json([
      ...daily.map((row) => ({ id: row.id, date: row.productionDate, totalLiters: row.totalLiters, source: 'DAILY_TOTAL' as const })),
      ...sessions.map((row) => ({ id: row.id, date: row.date, totalLiters: row.totalLiters, source: 'INDIVIDUAL_CONTROL' as const })),
    ].sort((a, b) => a.date.localeCompare(b.date)));
  })
  .get('/milk-sessions/:id', async (c) => {
    const id = c.req.param('id');
    const [session] = await getDb().select().from(milkSessions).where(eq(milkSessions.id, id)).limit(1);
    if (!session) return fail('Controle não encontrado.', 404, 'NOT_FOUND');
    const rows = await getDb().select({
      id: milkMeasurements.id,
      animalId: milkMeasurements.animalId,
      animalName: animals.name,
      tagNumber: animals.tagNumber,
      rawAnimalLabel: milkMeasurements.rawAnimalLabel,
      rawValueText: milkMeasurements.rawValueText,
      morningLiters: milkMeasurements.morningLiters,
      afternoonLiters: milkMeasurements.afternoonLiters,
      totalLiters: milkMeasurements.totalLiters,
      confidence: milkMeasurements.confidence,
      status: milkMeasurements.status,
      notes: milkMeasurements.notes,
    }).from(milkMeasurements).leftJoin(animals, eq(milkMeasurements.animalId, animals.id))
      .where(eq(milkMeasurements.milkSessionId, id)).orderBy(asc(milkMeasurements.createdAt));
    const splitRows = await getDb().select({
      animalId: milkMeasurements.animalId,
      morning: milkMeasurements.morningLiters,
      afternoon: milkMeasurements.afternoonLiters,
      date: milkSessions.sessionDate,
    }).from(milkMeasurements).innerJoin(milkSessions, eq(milkMeasurements.milkSessionId, milkSessions.id))
      .where(and(eq(milkMeasurements.status, 'CONFIRMED'), sql`${milkMeasurements.morningLiters} is not null`, sql`${milkMeasurements.afternoonLiters} is not null`));
    const history = splitRows.map((row) => ({ animalId: row.animalId, morning: Number(row.morning), afternoon: Number(row.afternoon), date: row.date }));
    const expectedHerd = await loadMilkingHerdOnDate(session.sessionDate);
    const linkedCounts = rows.reduce((counts, row) => {
      if (row.animalId && row.status !== 'EXCLUDED') counts.set(row.animalId, (counts.get(row.animalId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const measurements = rows.map((row) => {
      const expected = row.animalId ? expectedHerd.find((animal) => animal.id === row.animalId) : undefined;
      const issues: string[] = [];
      if (!row.animalId) issues.push('Sem vínculo com um animal.');
      if (row.animalId && (linkedCounts.get(row.animalId) ?? 0) > 1) issues.push('Animal repetido no controle.');
      if (row.confidence === 'LOW') issues.push('Baixa confiança na transcrição.');
      if (row.status === 'NEEDS_REVIEW') issues.push('Aguardando decisão e fora dos totais.');
      if (session.inputMode === 'SEPARATE_MORNING_AFTERNOON' && row.status !== 'EXCLUDED') {
        if (row.morningLiters === null) issues.push('Produção da manhã ausente.');
        if (expected?.milkingRoutine === 'MORNING_AND_AFTERNOON' && row.afternoonLiters === null) issues.push('Produção da tarde ausente para este lote.');
        if (expected?.milkingRoutine === 'MORNING_ONLY' && row.afternoonLiters !== null) issues.push('Lote com ordenha somente de manhã.');
      }
      return {
        ...row,
        issues,
        estimate: row.morningLiters === null && row.afternoonLiters === null ? estimateSplit(Number(row.totalLiters), row.animalId, history, session.sessionDate) : null,
      };
    });
    const linkedIds = new Set(rows.flatMap((row) => row.animalId ? [row.animalId] : []));
    const missingAnimals = session.inputMode === 'SEPARATE_MORNING_AFTERNOON'
      ? expectedHerd.filter((animal) => !linkedIds.has(animal.id)).map((animal) => ({ id: animal.id, name: animal.name, tagNumber: animal.tagNumber }))
      : [];
    const documents = await getDb().select().from(attachments).where(and(eq(attachments.milkSessionId, id), isNull(attachments.deletedAt)));
    return c.json({ ...session, measurements, missingAnimals, attachments: documents });
  })
  .patch('/milk-sessions/:id', async (c) => {
    const body = validate(z.object({ title: z.string().trim().max(160).nullable().optional(), notes: optionalText }), await readJson(c));
    const [updated] = await getDb().update(milkSessions).set({ ...body, updatedAt: new Date() }).where(eq(milkSessions.id, c.req.param('id'))).returning();
    if (!updated) return fail('Controle não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .delete('/milk-sessions/:id', async (c) => {
    const id = c.req.param('id');
    const [document] = await getDb().select({ id: attachments.id }).from(attachments).where(and(eq(attachments.milkSessionId, id), isNull(attachments.deletedAt))).limit(1);
    if (document) return fail('Remova ou desvincule os documentos antes de excluir o controle.', 409, 'HAS_ATTACHMENTS');
    const [removed] = await getDb().delete(milkSessions).where(eq(milkSessions.id, id)).returning();
    if (!removed) return fail('Controle não encontrado.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  })
  .patch('/milk-measurements/:id', async (c) => {
    const body = validate(measurementUpdateSchema, await readJson(c));
    const [current] = await getDb().select().from(milkMeasurements).where(eq(milkMeasurements.id, c.req.param('id'))).limit(1);
    if (!current) return fail('Medição não encontrada.', 404, 'NOT_FOUND');
    const morning = body.morningLiters === undefined ? (current.morningLiters === null ? null : Number(current.morningLiters)) : body.morningLiters;
    const afternoon = body.afternoonLiters === undefined ? (current.afternoonLiters === null ? null : Number(current.afternoonLiters)) : body.afternoonLiters;
    const total = body.totalLiters === undefined ? Number(current.totalLiters) : body.totalLiters;
    if ((morning !== null || afternoon !== null) && Math.abs((morning ?? 0) + (afternoon ?? 0) - total) > 0.011) {
      return fail('Manhã + tarde deve ser igual ao total.', 400, 'INVALID_TOTAL');
    }
    const values: Record<string, unknown> = { ...body, updatedAt: new Date() };
    for (const key of ['morningLiters', 'afternoonLiters', 'totalLiters'] as const) {
      if (body[key] !== undefined) values[key] = body[key] === null ? null : decimalString(body[key]);
    }
    const [updated] = await getDb().update(milkMeasurements).set(values).where(eq(milkMeasurements.id, c.req.param('id'))).returning();
    return c.json(updated);
  })
  .post('/import/chatgpt/validate', async (c) => {
    const body = validate(z.object({ content: z.string().min(1) }), await readJson(c));
    let parsed;
    try {
      parsed = parseChatGptImport(body.content);
    } catch (error) {
      if (error instanceof z.ZodError) return fail(error.issues.map((issue) => issue.message).join('; '));
      return fail(error instanceof Error ? error.message : 'Não foi possível validar os dados.');
    }
    const [allAnimals, allAliases, expectedHerd, previousRows] = await Promise.all([
      getDb().select().from(animals),
      getDb().select().from(animalAliases),
      loadMilkingHerdOnDate(parsed.sessionDate),
      getDb().select({ animalId: milkMeasurements.animalId, totalLiters: milkMeasurements.totalLiters, sessionDate: milkSessions.sessionDate })
        .from(milkMeasurements).innerJoin(milkSessions, eq(milkMeasurements.milkSessionId, milkSessions.id))
        .where(and(eq(milkMeasurements.status, 'CONFIRMED'), sql`${milkSessions.sessionDate} < ${parsed.sessionDate}`))
        .orderBy(desc(milkSessions.sessionDate)),
    ]);
    const matched = parsed.measurements.map((row) => {
      const normalized = normalizeLabel(row.rawAnimalLabel);
      const byTag = allAnimals.find((animal) => animal.tagNumber === row.rawAnimalLabel.trim());
      const byName = allAnimals.find((animal) => animal.name && normalizeLabel(animal.name) === normalized);
      const alias = allAliases.find((item) => item.normalizedAlias === normalized);
      const match = byTag ?? byName ?? (alias ? allAnimals.find((animal) => animal.id === alias.animalId) : undefined);
      return { row, match };
    });
    const matchCounts = matched.reduce((counts, item) => {
      if (item.match && !item.row.excluded) counts.set(item.match.id, (counts.get(item.match.id) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const measurements = matched.map(({ row, match }) => {
      const expected = match ? expectedHerd.find((animal) => animal.id === match.id) : undefined;
      const totalLiters = row.totalLiters ?? (row.morningLiters ?? 0) + (row.afternoonLiters ?? 0);
      const issues: string[] = [];
      if (!match) issues.push('Animal não encontrado por nome, brinco ou alias exato.');
      if (match && !expected) issues.push('Animal não fazia parte do rebanho em lactação nesta data.');
      if (match && (matchCounts.get(match.id) ?? 0) > 1) issues.push('Animal repetido no controle.');
      if (row.confidence === 'LOW') issues.push('Baixa confiança na transcrição.');
      if (!row.excluded && row.morningLiters === null) issues.push('Produção da manhã ausente.');
      if (!row.excluded && expected?.milkingRoutine === 'MORNING_AND_AFTERNOON' && row.afternoonLiters === null) issues.push('Produção da tarde ausente para este lote.');
      if (!row.excluded && expected?.milkingRoutine === 'MORNING_ONLY' && row.afternoonLiters !== null) issues.push('Este lote não possui ordenha à tarde.');
      if (match) {
        const history = previousRows.filter((previous) => previous.animalId === match.id).slice(0, 5).map((previous) => Number(previous.totalLiters));
        if (history.length >= 2) {
          const average = history.reduce((sum, value) => sum + value, 0) / history.length;
          const variation = average === 0 ? 0 : ((totalLiters - average) / average) * 100;
          if (Math.abs(variation) >= 40) issues.push(`Valor ${variation > 0 ? 'acima' : 'abaixo'} do histórico recente (${Math.abs(variation).toFixed(0)}%).`);
        }
      }
      return {
        ...row,
        totalLiters,
        status: row.excluded ? 'EXCLUDED' : issues.length ? 'NEEDS_REVIEW' : 'CONFIRMED',
        animalId: match?.id ?? null,
        matchedAnimal: match ? { id: match.id, name: match.name, tagNumber: match.tagNumber } : null,
        milkingRoutine: expected?.milkingRoutine ?? null,
        issues,
      };
    });
    const linkedIds = new Set(matched.flatMap((item) => item.match ? [item.match.id] : []));
    const missingAnimals = expectedHerd.filter((animal) => !linkedIds.has(animal.id)).map((animal) => ({ id: animal.id, name: animal.name, tagNumber: animal.tagNumber }));
    const sessionIssues = [
      ...(parsed.sourceMode !== 'SEPARATE_MORNING_AFTERNOON' ? ['O controle novo deve separar manhã e tarde.'] : []),
      ...(missingAnimals.length ? [`Faltam ${missingAnimals.length} vaca(s) em lactação nesta data.`] : []),
    ];
    return c.json({ sessionDate: parsed.sessionDate, sourceMode: parsed.sourceMode, measurements, missingAnimals, sessionIssues });
  })
  .post('/import/chatgpt', async (c) => {
    const body = validate(sessionSchema, await readJson(c));
    const created = await createMilkSession({ ...body, source: 'CHATGPT_IMPORT', title: body.title || 'Importação do ChatGPT' });
    return c.json(created, 201);
  });
