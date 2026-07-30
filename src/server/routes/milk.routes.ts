import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animalAliases, animalGroupAssignments, animals, animalStatusEvents, attachments, captures, dailyMilkTotals, herdGroups, milkMeasurements, milkSessions, proposedActions } from '../../db/schema.js';
import { canRegisterAnimalFromMeasurement, identityFromRawAnimalLabel } from '../../domain/animal-registration.js';
import { decimalString, normalizeLabel } from '../../domain/format.js';
import { resolveDailyMilkByDate } from '../../domain/daily-milk.js';
import { formatMilkImportIssues, parseMilkImport } from '../../domain/import.js';
import { suggestAnimalByLabel } from '../../domain/nl/matching.js';
import { estimateSplit } from '../../domain/milk.js';
import { fail } from '../http/api-error.js';
import { decimalInput, optionalText, readJson, validate } from '../http/validation.js';
import { createMilkSession, loadMilkingHerdOnDate, mergeMilkSession } from '../services/milk-session.service.js';
import { refreshCaptureStatus } from './captures.routes.js';

const measurementBaseSchema = z.object({
  animalId: z.string().uuid().nullable().optional(),
  rawAnimalLabel: z.string().trim().min(1).max(120),
  rawValueText: z.string().max(120).nullable().optional(),
  morningLiters: decimalInput.nullable().optional(),
  afternoonLiters: decimalInput.nullable().optional(),
  totalLiters: decimalInput.nullable(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('HIGH'),
  status: z.enum(['CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED']).default('CONFIRMED'),
  mergeDecision: z.enum(['ADD', 'COMPLETE_EXISTING', 'KEEP_EXISTING', 'REPLACE_EXISTING']).nullable().optional(),
  notes: optionalText,
  sources: z.array(z.object({
    captureId: z.string().uuid().nullable().optional(),
    proposedActionId: z.string().uuid().nullable().optional(),
    rawAnimalLabel: z.string().trim().min(1).max(120),
    rawValueText: z.string().max(120).nullable().optional(),
    morningLiters: decimalInput.nullable().optional(),
    afternoonLiters: decimalInput.nullable().optional(),
    totalLiters: decimalInput.nullable().optional(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('HIGH'),
    notes: optionalText,
  })).optional(),
});

const measurementSchema = measurementBaseSchema.superRefine((value, context) => {
  if (value.status !== 'EXCLUDED' && value.totalLiters === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['totalLiters'], message: 'Informe o total ou marque a linha como excluída.' });
    return;
  }
  if (value.morningLiters != null || value.afternoonLiters != null) {
    const sum = (value.morningLiters ?? 0) + (value.afternoonLiters ?? 0);
    if (value.totalLiters !== null && Math.abs(sum - value.totalLiters) > 0.011) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Manhã + tarde deve ser igual ao total.' });
  }
});

const measurementUpdateSchema = z.object({
  animalId: z.string().uuid().nullable().optional(),
  morningLiters: decimalInput.nullable().optional(),
  afternoonLiters: decimalInput.nullable().optional(),
  totalLiters: decimalInput.nullable().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  status: z.enum(['CONFIRMED', 'NEEDS_REVIEW', 'EXCLUDED']).optional(),
  notes: optionalText,
}).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');

const sessionSchema = z.object({
  sessionDate: z.string().date(),
  herdGroupId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(160).nullable().optional().transform((value) => value || null),
  inputMode: z.enum(['SEPARATE_MORNING_AFTERNOON', 'COMBINED_TOTAL', 'MIXED']),
  notes: optionalText,
  measurements: z.array(measurementSchema).min(1, 'Preencha ao menos um animal.'),
});

const bulkRegisterAnimalsSchema = z.object({
  groupId: z.string().uuid(),
  measurementIds: z.array(z.string().uuid()).min(1).max(300),
}).refine((value) => new Set(value.measurementIds).size === value.measurementIds.length, {
  path: ['measurementIds'],
  message: 'Não repita a mesma linha.',
});

// O handoff da revisão (/revisar → /producao/importar) informa a ação proposta
// de origem para que ela saia de NEEDS_REVIEW quando a importação salvar.
const importSessionSchema = sessionSchema.extend({
  sourceCaptureId: z.string().uuid().optional(),
  sourceActionId: z.string().uuid().optional(),
  sourceActions: z.array(z.object({
    captureId: z.string().uuid(),
    actionId: z.string().uuid(),
  })).max(20).optional(),
});

async function resolveSourceActions(
  sourceActions: Array<{ captureId: string; actionId: string }>,
  sessionId: string,
) {
  for (const source of sourceActions) {
    const [updated] = await getDb().update(proposedActions).set({
      status: 'CONFIRMED',
      committedRecordType: 'milk_session',
      committedRecordId: sessionId,
      updatedAt: new Date(),
    }).where(and(
      eq(proposedActions.id, source.actionId),
      eq(proposedActions.captureId, source.captureId),
      eq(proposedActions.status, 'NEEDS_REVIEW'),
    )).returning({ id: proposedActions.id });
    if (!updated) continue;
    const [capture] = await getDb().select({ documentAttachmentId: captures.documentAttachmentId })
      .from(captures).where(eq(captures.id, source.captureId)).limit(1);
    if (capture?.documentAttachmentId) {
      await getDb().update(attachments).set({ milkSessionId: sessionId })
        .where(eq(attachments.id, capture.documentAttachmentId));
    }
    await refreshCaptureStatus(source.captureId);
  }
}

function sessionScopeCondition(sessionDate: string, herdGroupId?: string | null) {
  return and(
    eq(milkSessions.sessionDate, sessionDate),
    herdGroupId ? eq(milkSessions.herdGroupId, herdGroupId) : isNull(milkSessions.herdGroupId),
  );
}

type StoredImportPayload = {
  sessionDate?: unknown;
  herdGroupId?: unknown;
  herdGroupLabel?: unknown;
  sourceMode?: unknown;
  measurements?: unknown;
};

function actionImport(action: { resolvedPayload: unknown }): StoredImportPayload | null {
  const payload = action.resolvedPayload as { import?: unknown } | null;
  const imported = payload?.import;
  return imported && typeof imported === 'object' ? imported as StoredImportPayload : null;
}

export const milkRoutes = new Hono()
  .get('/milk-sessions', async (c) => {
    const rows = await getDb().select({
      id: milkSessions.id,
      sessionDate: milkSessions.sessionDate,
      herdGroupId: milkSessions.herdGroupId,
      herdGroupName: herdGroups.name,
      title: milkSessions.title,
      inputMode: milkSessions.inputMode,
      source: milkSessions.source,
      notes: milkSessions.notes,
      confirmedTotal: sql<string>`coalesce(sum(case when ${milkMeasurements.status} = 'CONFIRMED' then ${milkMeasurements.totalLiters} else 0 end), 0)`,
      confirmedCount: sql<number>`count(*) filter (where ${milkMeasurements.status} = 'CONFIRMED')::int`,
      reviewCount: sql<number>`count(*) filter (where ${milkMeasurements.status} = 'NEEDS_REVIEW')::int`,
    }).from(milkSessions)
      .leftJoin(herdGroups, eq(milkSessions.herdGroupId, herdGroups.id))
      .leftJoin(milkMeasurements, eq(milkMeasurements.milkSessionId, milkSessions.id))
      .groupBy(milkSessions.id, herdGroups.name).orderBy(desc(milkSessions.sessionDate), desc(milkSessions.createdAt));
    return c.json(rows);
  })
  .get('/milking-herd', async (c) => {
    const parsed = z.object({
      date: z.string().date(),
      herdGroupId: z.string().uuid().optional(),
    }).safeParse({ date: c.req.query('date'), herdGroupId: c.req.query('herdGroupId') || undefined });
    if (!parsed.success) return fail('Informe uma data válida.', 400, 'INVALID_DATE');
    const herd = await loadMilkingHerdOnDate(parsed.data.date, parsed.data.herdGroupId);
    return c.json(herd.map((animal) => ({ id: animal.id, name: animal.name, tagNumber: animal.tagNumber, milkingRoutine: animal.milkingRoutine })));
  })
  .get('/milk-production-timeline', async (c) => {
    const daily = await getDb().select().from(dailyMilkTotals).orderBy(asc(dailyMilkTotals.productionDate));
    const resolvedDaily = resolveDailyMilkByDate(daily);
    const sessions = await getDb().select({
      date: milkSessions.sessionDate,
      totalLiters: sql<string>`coalesce(sum(case when ${milkMeasurements.status} = 'CONFIRMED' then ${milkMeasurements.totalLiters} else 0 end), 0)`,
    }).from(milkSessions).leftJoin(milkMeasurements, eq(milkMeasurements.milkSessionId, milkSessions.id))
      .groupBy(milkSessions.sessionDate).orderBy(asc(milkSessions.sessionDate));
    return c.json([
      ...resolvedDaily.map((row) => ({ id: row.recordIds[0] ?? `daily-groups-${row.productionDate}`, date: row.productionDate, totalLiters: decimalString(row.totalLiters), source: 'DAILY_TOTAL' as const, basis: row.basis, groupCount: row.groupCount })),
      ...sessions.map((row) => ({ id: `individual-${row.date}`, date: row.date, totalLiters: row.totalLiters, source: 'INDIVIDUAL_CONTROL' as const })),
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
    const expectedHerd = await loadMilkingHerdOnDate(session.sessionDate, session.herdGroupId);
    const linkedCounts = rows.reduce((counts, row) => {
      if (row.animalId && row.status !== 'EXCLUDED') counts.set(row.animalId, (counts.get(row.animalId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const measurements = rows.map((row) => {
      const expected = row.animalId ? expectedHerd.find((animal) => animal.id === row.animalId) : undefined;
      const issues: string[] = [];
      if (!row.animalId && row.status !== 'EXCLUDED') issues.push('Sem vínculo com um animal.');
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
        estimate: row.totalLiters !== null && row.morningLiters === null && row.afternoonLiters === null ? estimateSplit(Number(row.totalLiters), row.animalId, history, session.sessionDate) : null,
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
    const id = c.req.param('id');
    const body = validate(z.object({ sessionDate: z.string().date().optional(), title: z.string().trim().max(160).nullable().optional(), notes: optionalText }), await readJson(c));
    if (body.sessionDate) {
      const [current] = await getDb().select({ herdGroupId: milkSessions.herdGroupId }).from(milkSessions).where(eq(milkSessions.id, id)).limit(1);
      if (!current) return fail('Controle não encontrado.', 404, 'NOT_FOUND');
      const [sameScope] = await getDb().select({ id: milkSessions.id }).from(milkSessions).where(and(
        sessionScopeCondition(body.sessionDate, current.herdGroupId),
        ne(milkSessions.id, id),
      )).limit(1);
      if (sameScope) return fail('Já existe um controle individual deste lote nesta data.', 409, 'SESSION_DATE_EXISTS');
    }
    const updated = await getDb().transaction(async (tx) => {
      const [saved] = await tx.update(milkSessions).set({ ...body, updatedAt: new Date() }).where(eq(milkSessions.id, id)).returning();
      if (saved && body.sessionDate) {
        await tx.update(animalStatusEvents).set({ changedOn: body.sessionDate }).where(eq(animalStatusEvents.notes, `Situação definida a partir do controle individual ${id}.`));
        await tx.update(animalGroupAssignments).set({ startedOn: body.sessionDate }).where(eq(animalGroupAssignments.notes, `Lote definido a partir do controle individual ${id}.`));
      }
      return saved;
    });
    if (!updated) return fail('Controle não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .post('/milk-sessions/:id/register-unmatched-animals', async (c) => {
    const sessionId = c.req.param('id');
    const body = validate(bulkRegisterAnimalsSchema, await readJson(c));
    const db = getDb();
    const [[session], [group], selectedRows, allAnimals, allAliases] = await Promise.all([
      db.select({ id: milkSessions.id, sessionDate: milkSessions.sessionDate }).from(milkSessions).where(eq(milkSessions.id, sessionId)).limit(1),
      db.select({ id: herdGroups.id }).from(herdGroups).where(and(eq(herdGroups.id, body.groupId), eq(herdGroups.active, true), ne(herdGroups.milkingRoutine, 'NOT_MILKED'))).limit(1),
      db.select({ id: milkMeasurements.id, animalId: milkMeasurements.animalId, rawAnimalLabel: milkMeasurements.rawAnimalLabel, status: milkMeasurements.status, confidence: milkMeasurements.confidence })
        .from(milkMeasurements).where(and(eq(milkMeasurements.milkSessionId, sessionId), inArray(milkMeasurements.id, body.measurementIds))),
      db.select().from(animals),
      db.select().from(animalAliases),
    ]);
    if (!session) return fail('Controle não encontrado.', 404, 'NOT_FOUND');
    if (!group) return fail('Escolha um lote ativo com rotina de ordenha.', 400, 'INVALID_GROUP');
    if (selectedRows.length !== body.measurementIds.length) return fail('Uma ou mais linhas não pertencem a este controle.', 400, 'INVALID_MEASUREMENT');
    const invalid = selectedRows.find((row) => !canRegisterAnimalFromMeasurement(row));
    if (invalid) return fail(`A linha “${invalid.rawAnimalLabel}” não pode gerar um cadastro.`, 400, 'INVALID_MEASUREMENT');
    const normalizedLabels = selectedRows.map((row) => normalizeLabel(row.rawAnimalLabel));
    if (new Set(normalizedLabels).size !== normalizedLabels.length) return fail('Há rótulos repetidos na seleção. Revise essas linhas antes de cadastrar.', 409, 'DUPLICATE_LABEL');

    const registrations = await db.transaction(async (tx) => {
      const result: Array<{ measurementId: string; animal: { id: string; name: string | null; tagNumber: string | null }; created: boolean }> = [];
      for (const row of selectedRows) {
        const normalized = normalizeLabel(row.rawAnimalLabel);
        const byTag = allAnimals.find((animal) => animal.tagNumber === row.rawAnimalLabel.trim());
        const byName = allAnimals.find((animal) => animal.name && normalizeLabel(animal.name) === normalized);
        const alias = allAliases.find((item) => item.normalizedAlias === normalized);
        let animal = byTag ?? byName ?? (alias ? allAnimals.find((item) => item.id === alias.animalId) : undefined);
        let created = false;
        if (!animal) {
          const identity = identityFromRawAnimalLabel(row.rawAnimalLabel);
          [animal] = await tx.insert(animals).values({ ...identity, sex: 'FEMALE', status: 'LACTATING', notes: `Cadastrado a partir do controle individual ${session.id}.` }).returning();
          await tx.insert(animalStatusEvents).values({ animalId: animal.id, previousStatus: null, status: 'LACTATING', changedOn: session.sessionDate, notes: `Situação definida a partir do controle individual ${session.id}.` });
          await tx.insert(animalGroupAssignments).values({ animalId: animal.id, groupId: group.id, startedOn: session.sessionDate, notes: `Lote definido a partir do controle individual ${session.id}.` });
          allAnimals.push(animal);
          created = true;
        }
        const [linked] = await tx.update(milkMeasurements).set({ animalId: animal.id, updatedAt: new Date() })
          .where(and(eq(milkMeasurements.id, row.id), isNull(milkMeasurements.animalId))).returning({ id: milkMeasurements.id });
        if (!linked) return fail(`A linha “${row.rawAnimalLabel}” já foi vinculada. Recarregue o controle.`, 409, 'MEASUREMENT_ALREADY_LINKED');
        result.push({ measurementId: row.id, animal: { id: animal.id, name: animal.name, tagNumber: animal.tagNumber }, created });
      }
      return result;
    });
    return c.json({ created: registrations.filter((item) => item.created).length, linked: registrations.length, registrations }, 201);
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
    const total = body.totalLiters === undefined ? (current.totalLiters === null ? null : Number(current.totalLiters)) : body.totalLiters;
    const status = body.status ?? current.status;
    if (status !== 'EXCLUDED' && total === null) return fail('Informe o total ou mantenha a linha excluída.', 400, 'TOTAL_REQUIRED');
    if (total !== null && (morning !== null || afternoon !== null) && Math.abs((morning ?? 0) + (afternoon ?? 0) - total) > 0.011) {
      return fail('Manhã + tarde deve ser igual ao total.', 400, 'INVALID_TOTAL');
    }
    const values: Record<string, unknown> = { ...body, updatedAt: new Date() };
    for (const key of ['morningLiters', 'afternoonLiters', 'totalLiters'] as const) {
      if (body[key] !== undefined) values[key] = body[key] === null ? null : decimalString(body[key]);
    }
    const [updated] = await getDb().update(milkMeasurements).set(values).where(eq(milkMeasurements.id, c.req.param('id'))).returning();
    return c.json(updated);
  })
  .get('/import/milk-session/related', async (c) => {
    const query = validate(z.object({
      captureId: z.string().uuid(),
      actionId: z.string().uuid(),
    }), {
      captureId: c.req.query('captureId'),
      actionId: c.req.query('actionId'),
    });
    const [current] = await getDb().select().from(proposedActions).where(and(
      eq(proposedActions.id, query.actionId),
      eq(proposedActions.captureId, query.captureId),
      eq(proposedActions.actionType, 'INDIVIDUAL_MILK_SESSION'),
    )).limit(1);
    if (!current) return fail('Controle individual proposto não encontrado.', 404, 'NOT_FOUND');
    const baseImport = actionImport(current);
    if (!baseImport || typeof baseImport.sessionDate !== 'string' || !Array.isArray(baseImport.measurements)) {
      return fail('A captura não contém um controle individual válido.', 409, 'INVALID_CAPTURE_IMPORT');
    }

    const pending = await getDb().select().from(proposedActions).where(and(
      eq(proposedActions.actionType, 'INDIVIDUAL_MILK_SESSION'),
      eq(proposedActions.status, 'NEEDS_REVIEW'),
    )).orderBy(asc(proposedActions.createdAt));
    const groupId = typeof baseImport.herdGroupId === 'string' ? baseImport.herdGroupId : null;
    // Sem lote resolvido não há chave segura para combinar capturas.
    const related = groupId
      ? pending.filter((candidate) => {
        const imported = actionImport(candidate);
        return imported?.sessionDate === baseImport.sessionDate && imported?.herdGroupId === groupId;
      })
      : [current];
    const uniqueRelated = related.some((candidate) => candidate.id === current.id) ? related : [current, ...related];
    const measurements = uniqueRelated.flatMap((sourceAction) => {
      const imported = actionImport(sourceAction);
      if (!Array.isArray(imported?.measurements)) return [];
      return imported.measurements.flatMap((rawRow) => {
        if (!rawRow || typeof rawRow !== 'object') return [];
        const row = rawRow as Record<string, unknown>;
        const source = {
          captureId: sourceAction.captureId,
          proposedActionId: sourceAction.id,
          rawAnimalLabel: row.rawAnimalLabel,
          rawValueText: row.rawValueText ?? null,
          morningLiters: row.morningLiters ?? null,
          afternoonLiters: row.afternoonLiters ?? null,
          totalLiters: row.totalLiters ?? null,
          confidence: row.confidence ?? 'HIGH',
          notes: row.notes ?? null,
        };
        return [{ ...row, sources: [...(Array.isArray(row.sources) ? row.sources : []), source] }];
      });
    });
    const captureIds = [...new Set(uniqueRelated.map((action) => action.captureId))];
    const documents = captureIds.length ? await getDb().select({
      captureId: captures.id,
      attachmentId: attachments.id,
      filename: attachments.originalFilename,
      mimeType: attachments.mimeType,
      transcript: captures.transcript,
    }).from(captures)
      .leftJoin(attachments, eq(captures.documentAttachmentId, attachments.id))
      .where(inArray(captures.id, captureIds)) : [];
    return c.json({
      action: current,
      import: {
        ...baseImport,
        herdGroupId: groupId,
        measurements,
      },
      sourceActions: uniqueRelated.map((action) => ({ captureId: action.captureId, actionId: action.id })),
      documents,
    });
  })
  .post('/import/milk-session/validate', async (c) => {
    const body = validate(z.object({ content: z.string().min(1) }), await readJson(c));
    let parsed;
    try {
      parsed = parseMilkImport(body.content);
    } catch (error) {
      if (error instanceof z.ZodError) return fail(formatMilkImportIssues(error));
      return fail(error instanceof Error ? error.message : 'Não foi possível validar os dados.');
    }
    const [allAnimals, allAliases, expectedHerd, previousRows, existingRows, resolvedGroup] = await Promise.all([
      getDb().select().from(animals),
      getDb().select().from(animalAliases),
      loadMilkingHerdOnDate(parsed.sessionDate, parsed.herdGroupId),
      getDb().select({ animalId: milkMeasurements.animalId, totalLiters: milkMeasurements.totalLiters, sessionDate: milkSessions.sessionDate })
        .from(milkMeasurements).innerJoin(milkSessions, eq(milkMeasurements.milkSessionId, milkSessions.id))
        .where(and(eq(milkMeasurements.status, 'CONFIRMED'), sql`${milkSessions.sessionDate} < ${parsed.sessionDate}`))
        .orderBy(desc(milkSessions.sessionDate)),
      getDb().select({
        sessionId: milkSessions.id,
        sessionDate: milkSessions.sessionDate,
        title: milkSessions.title,
        measurementId: milkMeasurements.id,
        animalId: milkMeasurements.animalId,
        animalName: animals.name,
        tagNumber: animals.tagNumber,
        rawAnimalLabel: milkMeasurements.rawAnimalLabel,
        morningLiters: milkMeasurements.morningLiters,
        afternoonLiters: milkMeasurements.afternoonLiters,
        totalLiters: milkMeasurements.totalLiters,
        status: milkMeasurements.status,
      }).from(milkSessions)
        .leftJoin(milkMeasurements, eq(milkMeasurements.milkSessionId, milkSessions.id))
        .leftJoin(animals, eq(milkMeasurements.animalId, animals.id))
        .where(sessionScopeCondition(parsed.sessionDate, parsed.herdGroupId))
        .orderBy(asc(milkMeasurements.createdAt)),
      parsed.herdGroupId
        ? getDb().select({ id: herdGroups.id, name: herdGroups.name, milkingRoutine: herdGroups.milkingRoutine })
          .from(herdGroups).where(eq(herdGroups.id, parsed.herdGroupId)).limit(1)
        : Promise.resolve([]),
    ]);
    const existingMeasurements = existingRows.flatMap((row) => row.measurementId ? [{
      id: row.measurementId,
      animalId: row.animalId,
      animalName: row.animalName,
      tagNumber: row.tagNumber,
      rawAnimalLabel: row.rawAnimalLabel,
      morningLiters: row.morningLiters,
      afternoonLiters: row.afternoonLiters,
      totalLiters: row.totalLiters,
      status: row.status,
    }] : []);
    const activeExistingByAnimal = new Map(existingMeasurements
      .filter((row): row is typeof row & { animalId: string } => Boolean(row.animalId) && row.status !== 'EXCLUDED')
      .map((row) => [row.animalId, row]));
    const matched = parsed.measurements.map((row) => ({
      row,
      suggestion: suggestAnimalByLabel(row.rawAnimalLabel, allAnimals, allAliases, expectedHerd),
    }));
    const consolidated: typeof matched = [];
    for (const item of matched) {
      const matchId = item.suggestion?.animal.id;
      const previous = matchId && !item.row.excluded
        ? consolidated.find((candidate) => candidate.suggestion?.animal.id === matchId && !candidate.row.excluded)
        : undefined;
      const morningConflict = previous?.row.morningLiters != null && item.row.morningLiters != null
        && Math.abs(previous.row.morningLiters - item.row.morningLiters) > 0.011;
      const afternoonConflict = previous?.row.afternoonLiters != null && item.row.afternoonLiters != null
        && Math.abs(previous.row.afternoonLiters - item.row.afternoonLiters) > 0.011;
      if (!previous || morningConflict || afternoonConflict) {
        consolidated.push(item);
        continue;
      }
      const morningLiters = previous.row.morningLiters ?? item.row.morningLiters;
      const afternoonLiters = previous.row.afternoonLiters ?? item.row.afternoonLiters;
      previous.row = {
        ...previous.row,
        morningLiters,
        afternoonLiters,
        totalLiters: morningLiters === null && afternoonLiters === null ? null : (morningLiters ?? 0) + (afternoonLiters ?? 0),
        confidence: previous.row.confidence === 'LOW' || item.row.confidence === 'LOW'
          ? 'LOW'
          : previous.row.confidence === 'MEDIUM' || item.row.confidence === 'MEDIUM' ? 'MEDIUM' : 'HIGH',
        sources: [...(previous.row.sources ?? []), ...(item.row.sources ?? [])],
      };
    }
    const matchCounts = consolidated.reduce((counts, item) => {
      const match = item.suggestion?.animal;
      if (match && !item.row.excluded) counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const measurements = consolidated.map(({ row, suggestion }) => {
      const match = suggestion?.animal;
      const expected = match ? expectedHerd.find((animal) => animal.id === match.id) : undefined;
      const existingMeasurement = match ? activeExistingByAnimal.get(match.id) : undefined;
      const morningConflict = existingMeasurement?.morningLiters != null && row.morningLiters != null
        && Math.abs(Number(existingMeasurement.morningLiters) - row.morningLiters) > 0.011;
      const afternoonConflict = existingMeasurement?.afternoonLiters != null && row.afternoonLiters != null
        && Math.abs(Number(existingMeasurement.afternoonLiters) - row.afternoonLiters) > 0.011;
      const completesExisting = Boolean(existingMeasurement && !morningConflict && !afternoonConflict
        && (row.morningLiters != null || row.afternoonLiters != null));
      const morningLiters = completesExisting
        ? row.morningLiters ?? (existingMeasurement?.morningLiters == null ? null : Number(existingMeasurement.morningLiters))
        : row.morningLiters;
      const afternoonLiters = completesExisting
        ? row.afternoonLiters ?? (existingMeasurement?.afternoonLiters == null ? null : Number(existingMeasurement.afternoonLiters))
        : row.afternoonLiters;
      const totalLiters = morningLiters !== null || afternoonLiters !== null
        ? (morningLiters ?? 0) + (afternoonLiters ?? 0)
        : row.totalLiters;
      const issues: string[] = [];
      if (!match && !row.excluded) issues.push('Animal não encontrado no lote por nome, brinco ou alias.');
      if (match && !expected) issues.push('Animal não fazia parte deste lote em lactação nesta data.');
      if (suggestion?.kind === 'CONTEXTUAL_TAG') issues.push('Animal sugerido pelo brinco encontrado na anotação; confirme o vínculo.');
      if (suggestion?.kind === 'FUZZY') issues.push('Nome parecido com um único animal deste lote; confirme o vínculo sugerido.');
      if (match && (matchCounts.get(match.id) ?? 0) > 1) issues.push('Animal repetido no mesmo período; escolha o valor correto.');
      if (existingMeasurement && !row.excluded && !completesExisting) issues.push('Já existe um valor diferente para este animal no mesmo período.');
      if (row.confidence === 'LOW') issues.push('Baixa confiança na transcrição.');
      if (row.confidence === 'MEDIUM') issues.push('Leitura provável; confira nome e valor.');
      if (!row.excluded && expected?.milkingRoutine === 'MORNING_ONLY' && afternoonLiters !== null) issues.push('Este lote não possui ordenha à tarde.');
      if (match && totalLiters !== null && morningLiters !== null && afternoonLiters !== null) {
        const history = previousRows.filter((previous) => previous.animalId === match.id).slice(0, 5).map((previous) => Number(previous.totalLiters));
        if (history.length >= 2) {
          const average = history.reduce((sum, value) => sum + value, 0) / history.length;
          const variation = average === 0 ? 0 : ((totalLiters - average) / average) * 100;
          if (Math.abs(variation) >= 40) issues.push(`Valor ${variation > 0 ? 'acima' : 'abaixo'} do histórico recente (${Math.abs(variation).toFixed(0)}%).`);
        }
      }
      return {
        ...row,
        morningLiters,
        afternoonLiters,
        totalLiters,
        status: row.excluded ? 'EXCLUDED' : issues.length ? 'NEEDS_REVIEW' : 'CONFIRMED',
        animalId: match?.id ?? null,
        matchedAnimal: match ? { id: match.id, name: match.name, tagNumber: match.tagNumber } : null,
        milkingRoutine: expected?.milkingRoutine ?? null,
        mergeDecision: row.excluded || !existingMeasurement ? 'ADD' : completesExisting ? 'COMPLETE_EXISTING' : null,
        existingMeasurement: existingMeasurement ?? null,
        issues,
      };
    });
    const linkedIds = new Set([
      ...existingMeasurements.flatMap((row) => row.animalId && row.status !== 'EXCLUDED' ? [row.animalId] : []),
      ...consolidated.flatMap((item) => item.suggestion && !item.row.excluded ? [item.suggestion.animal.id] : []),
    ]);
    const missingAnimals = expectedHerd.filter((animal) => !linkedIds.has(animal.id)).map((animal) => ({ id: animal.id, name: animal.name, tagNumber: animal.tagNumber }));
    const sessionIssues = [
      ...(parsed.sourceMode !== 'SEPARATE_MORNING_AFTERNOON' ? ['O controle novo deve separar manhã e tarde.'] : []),
      ...(parsed.herdGroupLabel && !parsed.herdGroupId ? [`O lote “${parsed.herdGroupLabel}” não foi identificado; escolha o lote antes de salvar.`] : []),
      ...(parsed.herdGroupId && !resolvedGroup[0] ? ['O lote informado não existe mais.'] : []),
    ];
    const sessionWarnings = [
      ...(missingAnimals.length ? [`Há ${missingAnimals.length} vaca(s) do lote sem medição vinculada. Isso não registra ausência nem zero.`] : []),
      ...(!parsed.herdGroupId ? ['Controle sem lote: capturas adicionais não serão combinadas automaticamente.'] : []),
    ];
    const existingSession = existingRows[0] ? {
      id: existingRows[0].sessionId,
      sessionDate: existingRows[0].sessionDate,
      title: existingRows[0].title,
      measurementCount: existingMeasurements.filter((row) => row.status !== 'EXCLUDED').length,
      measurements: existingMeasurements,
    } : null;
    return c.json({
      sessionDate: parsed.sessionDate,
      herdGroupId: parsed.herdGroupId,
      herdGroupName: resolvedGroup[0]?.name ?? parsed.herdGroupLabel,
      sourceMode: parsed.sourceMode,
      measurements,
      missingAnimals,
      sessionIssues,
      sessionWarnings,
      existingSession,
    });
  })
  .post('/import/milk-session', async (c) => {
    const { sourceCaptureId, sourceActionId, sourceActions = [], ...body } = validate(importSessionSchema, await readJson(c));
    const sources = sourceActions.length
      ? sourceActions
      : sourceCaptureId && sourceActionId ? [{ captureId: sourceCaptureId, actionId: sourceActionId }] : [];
    const [sameScope] = await getDb().select({ id: milkSessions.id }).from(milkSessions)
      .where(sessionScopeCondition(body.sessionDate, body.herdGroupId)).limit(1);
    if (sameScope) {
      const merged = await mergeMilkSession(sameScope.id, { ...body, source: 'IMPORT', title: body.title || 'Controle importado' });
      await resolveSourceActions(sources, merged.id);
      return c.json(merged);
    }
    const created = await createMilkSession({ ...body, source: 'IMPORT', title: body.title || 'Controle importado' });
    await resolveSourceActions(sources, created.id);
    return c.json(created, 201);
  })
  .post('/milk-sessions', async (c) => {
    const body = validate(sessionSchema, await readJson(c));
    const created = await createMilkSession({ ...body, source: 'MANUAL', title: body.title || null });
    return c.json(created, 201);
  });
