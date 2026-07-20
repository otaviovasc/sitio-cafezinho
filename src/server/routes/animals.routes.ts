import { and, asc, desc, eq, gt, ilike, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import {
  animalAliases,
  animalExits,
  animalGroupAssignments,
  animalReproductiveEvents,
  animals,
  animalStatusEvents,
  attachments,
  animalWeights,
  herdGroups,
  mastitisActions,
  mastitisCases,
  milkMeasurements,
  milkSessions,
  revenues,
  weightSessions,
  type HerdGroup,
} from '../../db/schema.js';
import { animalSexes, animalStatuses, canTransitionStatus, isLiveStatus, statusAllowedForSex, statusMatchesGroupRoutine, statusRequiresMilkingGroup } from '../../domain/animal-lifecycle.js';
import { decimalString, normalizeLabel, parseDecimal } from '../../domain/format.js';
import { reproductiveOutcomes, summarizeReproduction } from '../../domain/reproduction.js';
import { fail } from '../http/api-error.js';
import { optionalText, readJson, validate } from '../http/validation.js';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const statusSchema = z.enum(animalStatuses);
const sexSchema = z.enum(animalSexes);
const reproductiveOutcomeSchema = z.enum(reproductiveOutcomes);
const exitTypes = ['CALF_SALE', 'BREEDING_SALE', 'PRODUCTIVE_CULL', 'HEALTH_CULL', 'MEAT_SALE', 'OTHER'] as const;
const optionalPositiveDecimal = z.union([z.string(), z.number(), z.null()]).optional().transform((value, context): number | null => {
  const parsed = parseDecimal(value);
  if (parsed === null) return null;
  if (parsed <= 0) { context.addIssue({ code: 'custom', message: 'Use um valor maior que zero.' }); return null; }
  return parsed;
});
const exitSchema = z.object({
  exitType: z.enum(exitTypes).nullable().optional(),
  reason: optionalText,
  buyerName: optionalText,
  weightKg: optionalPositiveDecimal,
  amount: optionalPositiveDecimal,
  notes: optionalText,
  createRevenue: z.boolean().optional().default(false),
  existingRevenueId: z.string().uuid().nullable().optional(),
}).nullable().optional();

const calfSchema = z.object({
  name: z.string().trim().max(120).nullable().optional().transform((value) => value || null),
  tagNumber: z.string().trim().max(60).nullable().optional().transform((value) => value || null),
  sex: sexSchema,
  sireId: z.string().uuid().nullable().optional(),
});

const statusChangeSchema = z.object({
  status: statusSchema,
  changedOn: z.string().date(),
  notes: optionalText,
  groupId: z.string().uuid().nullable().optional(),
  exit: exitSchema,
  calf: calfSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (!value.calf) return;
  if (value.status !== 'LACTATING') context.addIssue({ code: 'custom', path: ['calf'], message: 'O bezerro só pode ser registrado no parto (entrada em lactação).' });
  if (!value.calf.name && !value.calf.tagNumber) context.addIssue({ code: 'custom', path: ['calf'], message: 'Informe nome ou brinco do bezerro.' });
});

const reproductiveEventSchema = z.object({
  occurredOn: z.string().date(),
  hadBreeding: z.boolean(),
  bullId: z.string().uuid().nullable().optional(),
  bullName: optionalText,
  outcome: reproductiveOutcomeSchema.nullable().optional(),
  outcomeRecordedOn: z.string().date().nullable().optional(),
  notes: optionalText,
}).superRefine((value, context) => {
  if (!value.hadBreeding && (value.bullId || value.bullName || value.outcome || value.outcomeRecordedOn)) {
    context.addIssue({ code: 'custom', message: 'Sem cobertura, não informe touro ou resultado.' });
  }
  if (value.hadBreeding && value.bullId && value.bullName) {
    context.addIssue({ code: 'custom', path: ['bullId'], message: 'O touro da cobertura é um vínculo ou um nome, nunca os dois.' });
  }
  if (value.hadBreeding && value.outcome && value.outcome !== 'PENDING' && !value.outcomeRecordedOn) {
    context.addIssue({ code: 'custom', path: ['outcomeRecordedOn'], message: 'Informe quando o resultado foi confirmado.' });
  }
  if (value.outcomeRecordedOn && value.outcomeRecordedOn < value.occurredOn) {
    context.addIssue({ code: 'custom', path: ['outcomeRecordedOn'], message: 'O resultado não pode ser anterior ao cio.' });
  }
});

function normalizedReproductiveEvent(body: z.output<typeof reproductiveEventSchema>) {
  const outcome = body.hadBreeding ? (body.outcome ?? 'PENDING') : null;
  return {
    occurredOn: body.occurredOn,
    hadBreeding: body.hadBreeding,
    bullId: body.hadBreeding ? (body.bullId ?? null) : null,
    bullName: body.hadBreeding ? body.bullName : null,
    outcome,
    outcomeRecordedOn: outcome && outcome !== 'PENDING' ? (body.outcomeRecordedOn ?? null) : null,
    notes: body.notes,
  };
}

const identificationFields = {
  name: z.string().trim().max(120).nullable().optional().transform((value) => value || null),
  tagNumber: z.string().trim().max(60).nullable().optional().transform((value) => value || null),
  notes: optionalText,
};

const animalUpdateSchema = z.object(identificationFields)
  .refine((value) => value.name || value.tagNumber, { message: 'Informe nome ou brinco.' });

const animalCreateSchema = z.object({
  ...identificationFields,
  sex: sexSchema,
  status: statusSchema.default('LACTATING'),
  groupId: z.string().uuid().nullable().optional(),
  damId: z.string().uuid().nullable().optional(),
  sireId: z.string().uuid().nullable().optional(),
  changedOn: z.string().date().optional(),
}).superRefine((value, context) => {
  if (!value.name && !value.tagNumber) context.addIssue({ code: 'custom', message: 'Informe nome ou brinco.' });
  if (!statusAllowedForSex(value.status, value.sex)) context.addIssue({ code: 'custom', path: ['status'], message: 'Esta situação não combina com o sexo do animal.' });
  if (statusRequiresMilkingGroup(value.status) && !value.groupId) context.addIssue({ code: 'custom', path: ['groupId'], message: 'Escolha o lote de ordenha para uma vaca em lactação.' });
});

const bulkAnimalItemSchema = z.object({
  ...identificationFields,
  sex: sexSchema,
  damId: z.string().uuid().nullable().optional(),
  sireId: z.string().uuid().nullable().optional(),
});

const bulkCreateSchema = z.object({
  status: statusSchema,
  groupId: z.string().uuid().nullable().optional(),
  changedOn: z.string().date(),
  animals: z.array(bulkAnimalItemSchema.refine((value) => value.name || value.tagNumber, 'Informe nome ou brinco.')).min(1).max(200),
}).superRefine((value, context) => {
  if (statusRequiresMilkingGroup(value.status) && !value.groupId) context.addIssue({ code: 'custom', path: ['groupId'], message: 'Escolha o lote de ordenha.' });
  for (const [index, animal] of value.animals.entries()) {
    if (!statusAllowedForSex(value.status, animal.sex)) context.addIssue({ code: 'custom', path: ['animals', index, 'sex'], message: 'Esta situação não combina com o sexo do animal.' });
  }
});

async function ensureUniqueTag(tagNumber: string | null | undefined, exceptId?: string) {
  if (!tagNumber) return;
  const condition = exceptId ? and(eq(animals.tagNumber, tagNumber), ne(animals.id, exceptId)) : eq(animals.tagNumber, tagNumber);
  const [duplicate] = await getDb().select({ id: animals.id }).from(animals).where(condition).limit(1);
  if (duplicate) throw new Error('DUPLICATE_TAG');
}

async function getActiveGroup(groupId: string | null | undefined) {
  if (!groupId) return null;
  const [group] = await getDb().select().from(herdGroups).where(and(eq(herdGroups.id, groupId), eq(herdGroups.active, true))).limit(1);
  return group ?? null;
}

async function validateDam(damId: string | null | undefined) {
  if (!damId) return null;
  const [dam] = await getDb().select().from(animals).where(eq(animals.id, damId)).limit(1);
  if (!dam || dam.sex !== 'FEMALE' || !isLiveStatus(dam.status)) return 'A mãe precisa ser uma fêmea viva do rebanho.';
  return null;
}

async function validateSire(sireId: string | null | undefined) {
  if (!sireId) return null;
  const [sire] = await getDb().select().from(animals).where(eq(animals.id, sireId)).limit(1);
  if (!sire || sire.status !== 'BULL') return 'O pai precisa ser um touro vivo do rebanho.';
  return null;
}

async function validateBull(bullId: string | null | undefined) {
  if (!bullId) return null;
  const [bull] = await getDb().select().from(animals).where(eq(animals.id, bullId)).limit(1);
  if (!bull || bull.status !== 'BULL') return 'O touro da cobertura precisa ser um touro vivo do rebanho.';
  return null;
}

function groupForStatusError(status: z.infer<typeof statusSchema>) {
  if (!isLiveStatus(status)) return 'Animal que saiu do rebanho não entra em lote.';
  return status === 'LACTATING'
    ? 'Vacas em lactação precisam de um lote com rotina de ordenha.'
    : 'Esta situação só aceita lote sem ordenha.';
}

type ResolvedGroup =
  | { group: HerdGroup | null; error: null; code: null }
  | { group: null; error: string; code: string };

async function resolveGroupForStatus(status: z.infer<typeof statusSchema>, groupId: string | null | undefined, missingGroup: { message: string; code: string }): Promise<ResolvedGroup> {
  const group = await getActiveGroup(groupId);
  if (groupId && !group) return { group: null, error: 'Lote ativo não encontrado.', code: 'INVALID_GROUP' };
  if (group && !statusMatchesGroupRoutine(status, group.milkingRoutine)) return { group: null, error: groupForStatusError(status), code: 'INVALID_GROUP' };
  if (statusRequiresMilkingGroup(status) && !group) return { group: null, error: missingGroup.message, code: missingGroup.code };
  return { group, error: null, code: null };
}

export const animalRoutes = new Hono()
  .get('/animals', async (c) => {
    const search = c.req.query('search')?.trim();
    const onDateInput = c.req.query('onDate');
    const onDate = onDateInput ? validate(z.string().date(), onDateInput) : null;
    const db = getDb();
    const rows = await db.select().from(animals).where(search ? or(
      ilike(animals.name, `%${search}%`),
      ilike(animals.tagNumber, `%${search}%`),
    ) : undefined).orderBy(asc(animals.name), asc(animals.tagNumber));
    const [aliases, groups, weights, production] = await Promise.all([
      db.select().from(animalAliases).orderBy(asc(animalAliases.alias)),
      db.select({
        animalId: animalGroupAssignments.animalId,
        id: herdGroups.id,
        name: herdGroups.name,
        milkingRoutine: herdGroups.milkingRoutine,
      }).from(animalGroupAssignments).innerJoin(herdGroups, eq(animalGroupAssignments.groupId, herdGroups.id))
        .where(onDate ? and(
          lte(animalGroupAssignments.startedOn, onDate),
          or(isNull(animalGroupAssignments.endedOn), gt(animalGroupAssignments.endedOn, onDate)),
        ) : isNull(animalGroupAssignments.endedOn)),
      db.select({ animalId: animalWeights.animalId, weightKg: animalWeights.weightKg, measuredAt: animalWeights.measuredAt })
        .from(animalWeights).where(and(isNotNull(animalWeights.animalId), eq(animalWeights.status, 'CONFIRMED'), isNotNull(animalWeights.weightKg)))
        .orderBy(desc(animalWeights.measuredAt)),
      db.select({ animalId: milkMeasurements.animalId, totalLiters: milkMeasurements.totalLiters, sessionDate: milkSessions.sessionDate })
        .from(milkMeasurements).innerJoin(milkSessions, eq(milkMeasurements.milkSessionId, milkSessions.id))
        .where(and(isNotNull(milkMeasurements.animalId), eq(milkMeasurements.status, 'CONFIRMED')))
        .orderBy(desc(milkSessions.sessionDate)),
    ]);
    return c.json(rows.map((animal) => ({
      ...animal,
      aliases: aliases.filter((alias) => alias.animalId === animal.id),
      currentGroup: groups.find((group) => group.animalId === animal.id) ?? null,
      latestWeight: weights.find((weight) => weight.animalId === animal.id) ?? null,
      latestProduction: production.find((measurement) => measurement.animalId === animal.id) ?? null,
    })));
  })
  .post('/animals', async (c) => {
    const body = validate(animalCreateSchema, await readJson(c));
    try { await ensureUniqueTag(body.tagNumber); } catch { return fail('Já existe um animal com este brinco.', 409, 'DUPLICATE_TAG'); }
    const resolved = await resolveGroupForStatus(body.status, body.groupId, { message: 'Escolha um lote ativo com rotina de ordenha.', code: 'INVALID_GROUP' });
    if (resolved.error) return fail(resolved.error, 400, resolved.code);
    const damError = await validateDam(body.damId);
    if (damError) return fail(damError, 400, 'INVALID_DAM');
    const sireError = await validateSire(body.sireId);
    if (sireError) return fail(sireError, 400, 'INVALID_SIRE');
    const group = resolved.group;
    const changedOn = body.changedOn ?? today();
    const created = await getDb().transaction(async (tx) => {
      const [saved] = await tx.insert(animals).values({ name: body.name, tagNumber: body.tagNumber, sex: body.sex, status: body.status, damId: body.damId ?? null, sireId: body.sireId ?? null, notes: body.notes }).returning();
      await tx.insert(animalStatusEvents).values({ animalId: saved.id, previousStatus: null, status: body.status, changedOn, notes: 'Situação definida no cadastro.' });
      if (group) await tx.insert(animalGroupAssignments).values({ animalId: saved.id, groupId: group.id, startedOn: changedOn, notes: 'Lote definido no cadastro do animal.' });
      return saved;
    });
    return c.json(created, 201);
  })
  .post('/animals/bulk', async (c) => {
    const body = validate(bulkCreateSchema, await readJson(c));
    const tags = body.animals.map((animal) => animal.tagNumber).filter((value): value is string => Boolean(value));
    if (new Set(tags).size !== tags.length) return fail('Há brincos repetidos na lista.', 409, 'DUPLICATE_TAG');
    for (const tag of tags) {
      try { await ensureUniqueTag(tag); } catch { return fail(`O brinco ${tag} já está cadastrado.`, 409, 'DUPLICATE_TAG'); }
    }
    const resolved = await resolveGroupForStatus(body.status, body.groupId, { message: 'Escolha um lote ativo com rotina de ordenha.', code: 'INVALID_GROUP' });
    if (resolved.error) return fail(resolved.error, 400, resolved.code);
    for (const animal of body.animals) {
      const damError = await validateDam(animal.damId);
      if (damError) return fail(damError, 400, 'INVALID_DAM');
      const sireError = await validateSire(animal.sireId);
      if (sireError) return fail(sireError, 400, 'INVALID_SIRE');
    }
    const group = resolved.group;
    const created = await getDb().transaction(async (tx) => {
      const saved = await tx.insert(animals).values(body.animals.map((animal) => ({ name: animal.name, tagNumber: animal.tagNumber, sex: animal.sex, status: body.status, damId: animal.damId ?? null, sireId: animal.sireId ?? null, notes: animal.notes }))).returning();
      await tx.insert(animalStatusEvents).values(saved.map((animal) => ({ animalId: animal.id, previousStatus: null, status: body.status, changedOn: body.changedOn, notes: 'Cadastro em massa.' })));
      if (group) await tx.insert(animalGroupAssignments).values(saved.map((animal) => ({ animalId: animal.id, groupId: group.id, startedOn: body.changedOn, notes: 'Lote definido no cadastro em massa.' })));
      return saved;
    });
    return c.json({ created: created.length, animals: created }, 201);
  })
  .get('/animals/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb();
    const [animal] = await db.select().from(animals).where(eq(animals.id, id)).limit(1);
    if (!animal) return fail('Animal não encontrado.', 404, 'NOT_FOUND');
    const [aliases, weights, history, groupHistory, statusHistory, reproductiveEvents, mastitisHistory, mastitisActionRows, exitHistory, animalRevenueRows, animalExitDocuments] = await Promise.all([
      db.select().from(animalAliases).where(eq(animalAliases.animalId, id)).orderBy(asc(animalAliases.alias)),
      db.select({
        id: animalWeights.id,
        measuredAt: animalWeights.measuredAt,
        weightKg: animalWeights.weightKg,
        confidence: animalWeights.confidence,
        status: animalWeights.status,
        notes: animalWeights.notes,
        sessionId: animalWeights.weightSessionId,
        sessionDate: weightSessions.measuredOn,
      }).from(animalWeights).leftJoin(weightSessions, eq(animalWeights.weightSessionId, weightSessions.id))
        .where(eq(animalWeights.animalId, id)).orderBy(desc(animalWeights.measuredAt)),
      db.select({
        id: milkMeasurements.id,
        sessionDate: milkSessions.sessionDate,
        totalLiters: milkMeasurements.totalLiters,
        status: milkMeasurements.status,
        morningLiters: milkMeasurements.morningLiters,
        afternoonLiters: milkMeasurements.afternoonLiters,
      }).from(milkMeasurements).innerJoin(milkSessions, eq(milkMeasurements.milkSessionId, milkSessions.id))
        .where(eq(milkMeasurements.animalId, id)).orderBy(desc(milkSessions.sessionDate)),
      db.select({
        id: animalGroupAssignments.id,
        groupId: herdGroups.id,
        groupName: herdGroups.name,
        milkingRoutine: herdGroups.milkingRoutine,
        startedOn: animalGroupAssignments.startedOn,
        endedOn: animalGroupAssignments.endedOn,
        notes: animalGroupAssignments.notes,
      }).from(animalGroupAssignments).innerJoin(herdGroups, eq(animalGroupAssignments.groupId, herdGroups.id))
        .where(eq(animalGroupAssignments.animalId, id)).orderBy(desc(animalGroupAssignments.startedOn), desc(animalGroupAssignments.createdAt)),
      db.select().from(animalStatusEvents).where(eq(animalStatusEvents.animalId, id))
        .orderBy(desc(animalStatusEvents.changedOn), desc(animalStatusEvents.createdAt)),
      db.select().from(animalReproductiveEvents).where(eq(animalReproductiveEvents.animalId, id))
        .orderBy(desc(animalReproductiveEvents.occurredOn), desc(animalReproductiveEvents.createdAt)),
      db.select().from(mastitisCases).where(eq(mastitisCases.animalId, id)).orderBy(desc(mastitisCases.detectedAt)),
      db.select({
        id: mastitisActions.id, mastitisCaseId: mastitisActions.mastitisCaseId, scheduledFor: mastitisActions.scheduledFor,
        actionDescription: mastitisActions.actionDescription, completedAt: mastitisActions.completedAt,
        completionNotes: mastitisActions.completionNotes, cancelledAt: mastitisActions.cancelledAt,
      }).from(mastitisActions).innerJoin(mastitisCases, eq(mastitisActions.mastitisCaseId, mastitisCases.id))
        .where(eq(mastitisCases.animalId, id)).orderBy(asc(mastitisActions.scheduledFor)),
      db.select({
        id: animalExits.id, statusEventId: animalExits.statusEventId, exitType: animalExits.exitType, reason: animalExits.reason,
        buyerName: animalExits.buyerName, weightKg: animalExits.weightKg, amount: animalExits.amount, revenueId: animalExits.revenueId,
        notes: animalExits.notes, changedOn: animalStatusEvents.changedOn, status: animalStatusEvents.status,
      }).from(animalExits).innerJoin(animalStatusEvents, eq(animalExits.statusEventId, animalStatusEvents.id))
        .where(eq(animalExits.animalId, id)).orderBy(desc(animalStatusEvents.changedOn)),
      db.select().from(revenues).where(eq(revenues.animalId, id)).orderBy(desc(revenues.revenueDate)),
      db.select().from(attachments).innerJoin(animalExits, eq(attachments.animalExitId, animalExits.id))
        .where(and(eq(animalExits.animalId, id), isNull(attachments.deletedAt))),
    ]);
    const currentAssignment = groupHistory.find((assignment) => assignment.endedOn === null);
    const currentGroup = currentAssignment ? { id: currentAssignment.groupId, name: currentAssignment.groupName, milkingRoutine: currentAssignment.milkingRoutine } : null;
    return c.json({
      ...animal,
      aliases,
      weights,
      history,
      groupHistory,
      statusHistory,
      reproductiveEvents,
      mastitisCases: mastitisHistory.map((item) => ({ ...item, actions: mastitisActionRows.filter((action) => action.mastitisCaseId === item.id) })),
      exits: exitHistory.map((item) => ({ ...item, attachments: animalExitDocuments.filter((row) => row.attachments.animalExitId === item.id).map((row) => row.attachments) })),
      revenues: animalRevenueRows,
      reproductiveSummary: summarizeReproduction(reproductiveEvents),
      currentGroup,
    });
  })
  .patch('/animals/:id', async (c) => {
    const id = c.req.param('id');
    const body = validate(animalUpdateSchema, await readJson(c));
    try { await ensureUniqueTag(body.tagNumber, id); } catch { return fail('Já existe outro animal com este brinco.', 409, 'DUPLICATE_TAG'); }
    const [updated] = await getDb().update(animals).set({ ...body, updatedAt: new Date() }).where(eq(animals.id, id)).returning();
    if (!updated) return fail('Animal não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .delete('/animals/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb();
    const [animal] = await db.select({ id: animals.id }).from(animals).where(eq(animals.id, id)).limit(1);
    if (!animal) return fail('Animal não encontrado.', 404, 'NOT_FOUND');

    const [reproductiveHistory, mastitisHistory, exitHistory, revenueHistory] = await Promise.all([
      db.select({ id: animalReproductiveEvents.id }).from(animalReproductiveEvents).where(eq(animalReproductiveEvents.animalId, id)).limit(1),
      db.select({ id: mastitisCases.id }).from(mastitisCases).where(eq(mastitisCases.animalId, id)).limit(1),
      db.select({ id: animalExits.id }).from(animalExits).where(eq(animalExits.animalId, id)).limit(1),
      db.select({ id: revenues.id }).from(revenues).where(eq(revenues.animalId, id)).limit(1),
    ]);
    const protectedHistory = [
      reproductiveHistory.length ? 'histórico reprodutivo' : null,
      mastitisHistory.length ? 'caso de mastite' : null,
      exitHistory.length ? 'saída do rebanho' : null,
      revenueHistory.length ? 'receita vinculada' : null,
    ].filter((item): item is string => Boolean(item));
    if (protectedHistory.length) {
      return fail(`Este animal possui ${protectedHistory.join(', ')}. Corrija esses vínculos antes de excluir o cadastro.`, 409, 'ANIMAL_HAS_PROTECTED_HISTORY');
    }

    const deletedMeasurements = await db.transaction(async (tx) => {
      const removed = await tx.delete(milkMeasurements).where(eq(milkMeasurements.animalId, id)).returning({ id: milkMeasurements.id });
      await tx.delete(animals).where(eq(animals.id, id));
      return removed.length;
    });
    return c.json({ deleted: true, deletedMeasurements });
  })
  .post('/animals/:id/status-changes', async (c) => {
    const animalId = c.req.param('id');
    const body = validate(statusChangeSchema, await readJson(c));
    if (body.changedOn > today()) return fail('A data da mudança não pode estar no futuro.', 400, 'FUTURE_STATUS_DATE');
    const db = getDb();
    const [animal] = await db.select().from(animals).where(eq(animals.id, animalId)).limit(1);
    if (!animal) return fail('Animal não encontrado.', 404, 'NOT_FOUND');
    if (animal.status === body.status) return fail('O animal já está nesta situação.', 409, 'SAME_STATUS');
    if (!canTransitionStatus(animal.status, body.status)) return fail('Esta mudança não faz parte do ciclo produtivo esperado. Corrija a última mudança se a situação atual estiver errada.', 409, 'INVALID_STATUS_TRANSITION');
    if (!statusAllowedForSex(body.status, animal.sex)) return fail('Esta situação não combina com o sexo do animal.', 400, 'STATUS_SEX_MISMATCH');
    if ((body.status === 'SOLD' || body.status === 'DEAD') && !body.notes) return fail('Informe uma observação para preservar o motivo desta saída do rebanho.', 400, 'STATUS_NOTES_REQUIRED');
    if (body.status === 'DEAD' && body.exit && (body.exit.amount || body.exit.createRevenue || body.exit.existingRevenueId || body.exit.buyerName || body.exit.exitType)) {
      return fail('Morte não utiliza o fluxo comercial de venda.', 400, 'DEATH_COMMERCIAL_DATA');
    }
    if (body.status === 'SOLD' && body.exit?.createRevenue && body.exit.existingRevenueId) return fail('Escolha entre criar ou vincular uma receita.', 400, 'MULTIPLE_REVENUE_OPTIONS');
    if (body.status === 'SOLD' && body.exit?.createRevenue && !body.exit.amount) return fail('Informe o valor para criar a receita da venda.', 400, 'SALE_AMOUNT_REQUIRED');
    const [existingRevenue] = body.status === 'SOLD' && body.exit?.existingRevenueId
      ? await db.select().from(revenues).where(eq(revenues.id, body.exit.existingRevenueId)).limit(1)
      : [];
    if (body.exit?.existingRevenueId && !existingRevenue) return fail('Receita não encontrada.', 404, 'REVENUE_NOT_FOUND');
    if (existingRevenue?.animalId && existingRevenue.animalId !== animalId) return fail('A receita já está vinculada a outro animal.', 409, 'REVENUE_ANIMAL_CONFLICT');
    const [latestEvent] = await db.select().from(animalStatusEvents).where(eq(animalStatusEvents.animalId, animalId)).orderBy(desc(animalStatusEvents.changedOn), desc(animalStatusEvents.createdAt)).limit(1);
    if (latestEvent && body.changedOn < latestEvent.changedOn) return fail('A mudança não pode ser anterior à situação atual.', 400, 'INVALID_STATUS_DATE');
    const resolved = await resolveGroupForStatus(body.status, body.groupId, { message: 'Ao entrar em lactação, escolha o lote de ordenha.', code: 'GROUP_REQUIRED' });
    if (resolved.error) return fail(resolved.error, 400, resolved.code);
    const group = resolved.group;
    if (body.calf?.sireId) {
      const sireError = await validateSire(body.calf.sireId);
      if (sireError) return fail(sireError, 400, 'INVALID_SIRE');
    }
    if (body.calf?.tagNumber) {
      try { await ensureUniqueTag(body.calf.tagNumber); } catch { return fail('Já existe um animal com este brinco.', 409, 'DUPLICATE_TAG'); }
    }
    const [currentGroup] = await db.select().from(animalGroupAssignments).where(and(eq(animalGroupAssignments.animalId, animalId), isNull(animalGroupAssignments.endedOn))).limit(1);
    const result = await db.transaction(async (tx) => {
      if (currentGroup) await tx.update(animalGroupAssignments).set({ endedOn: body.changedOn }).where(eq(animalGroupAssignments.id, currentGroup.id));
      if (group) await tx.insert(animalGroupAssignments).values({ animalId, groupId: group.id, startedOn: body.changedOn, notes: statusRequiresMilkingGroup(body.status) ? 'Lote definido ao entrar em lactação.' : 'Lote definido na mudança de situação.' });
      await tx.update(animals).set({ status: body.status, updatedAt: new Date() }).where(eq(animals.id, animalId));
      const [created] = await tx.insert(animalStatusEvents).values({ animalId, previousStatus: animal.status, status: body.status, changedOn: body.changedOn, notes: body.notes }).returning();
      if (body.status === 'LACTATING') {
        await tx.insert(animalReproductiveEvents).values({
          animalId,
          statusEventId: created.id,
          type: 'CALVING',
          occurredOn: body.changedOn,
          notes: body.notes,
        });
      }
      let calfId: string | null = null;
      if (body.status === 'LACTATING' && body.calf) {
        const [calf] = await tx.insert(animals).values({
          name: body.calf.name,
          tagNumber: body.calf.tagNumber,
          sex: body.calf.sex,
          status: 'CALF',
          damId: animalId,
          sireId: body.calf.sireId ?? null,
          notes: `Bezerro registrado no parto de ${animal.name || `animal ${animal.tagNumber}`}.`,
        }).returning();
        await tx.insert(animalStatusEvents).values({ animalId: calf.id, previousStatus: null, status: 'CALF', changedOn: body.changedOn, notes: 'Nascimento registrado no parto.' });
        calfId = calf.id;
      }
      let revenueId = body.status === 'SOLD' ? (body.exit?.existingRevenueId ?? null) : null;
      let revenueCreatedHere = false;
      if (body.status === 'SOLD' && body.exit?.createRevenue && body.exit.amount) {
        const category = body.exit.exitType === 'CALF_SALE' ? 'CALF_SALE' as const
          : ['PRODUCTIVE_CULL', 'HEALTH_CULL', 'MEAT_SALE'].includes(body.exit.exitType ?? '') ? 'CULL_SALE' as const
            : 'ANIMAL_SALE' as const;
        const [revenue] = await tx.insert(revenues).values({
          revenueDate: body.changedOn,
          category,
          description: `Venda de ${animal.name || `animal ${animal.tagNumber}`}`,
          amount: decimalString(body.exit.amount),
          status: 'RECEIVED',
          receivedAt: new Date(),
          animalId,
          buyerName: body.exit.buyerName,
          notes: body.exit.reason ?? body.notes,
        }).returning();
        revenueId = revenue.id;
        revenueCreatedHere = true;
      } else if (revenueId) {
        await tx.update(revenues).set({ animalId, updatedAt: new Date() }).where(eq(revenues.id, revenueId));
      }
      let exitId: string | null = null;
      if (body.status === 'SOLD' || body.status === 'DEAD') {
        const [exit] = await tx.insert(animalExits).values({
          animalId,
          statusEventId: created.id,
          exitType: body.status === 'SOLD' ? (body.exit?.exitType ?? null) : null,
          reason: body.exit?.reason ?? body.notes,
          buyerName: body.status === 'SOLD' ? (body.exit?.buyerName ?? null) : null,
          weightKg: body.exit?.weightKg ? decimalString(body.exit.weightKg) : null,
          amount: body.status === 'SOLD' && body.exit?.amount ? decimalString(body.exit.amount) : existingRevenue?.amount ?? null,
          revenueId,
          revenueCreatedHere,
          notes: body.exit?.notes ?? null,
        }).returning();
        exitId = exit.id;
      }
      return { ...created, exitId, revenueId, calfId };
    });
    const leavingMilking = animal.status === 'LACTATING' && body.status !== 'LACTATING';
    const [suggestedGroup] = leavingMilking && !group
      ? await db.select({ id: herdGroups.id, name: herdGroups.name }).from(herdGroups)
        .where(and(eq(herdGroups.active, true), eq(herdGroups.milkingRoutine, 'NOT_MILKED'))).orderBy(asc(herdGroups.name)).limit(1)
      : [];
    return c.json({ ...result, suggestedGroup: suggestedGroup ?? null }, 201);
  })
  .delete('/animals/:id/status-changes/:eventId', async (c) => {
    const animalId = c.req.param('id');
    const eventId = c.req.param('eventId');
    const db = getDb();
    const [animal] = await db.select().from(animals).where(eq(animals.id, animalId)).limit(1);
    if (!animal) return fail('Animal não encontrado.', 404, 'NOT_FOUND');
    const events = await db.select().from(animalStatusEvents).where(eq(animalStatusEvents.animalId, animalId))
      .orderBy(desc(animalStatusEvents.changedOn), desc(animalStatusEvents.createdAt));
    const latest = events[0];
    if (!latest || latest.id !== eventId || !latest.previousStatus || animal.status !== latest.status) {
      return fail('Somente a mudança mais recente pode ser desfeita.', 409, 'STATUS_UNDO_NOT_ALLOWED');
    }
    const [currentGroup] = await db.select().from(animalGroupAssignments)
      .where(and(eq(animalGroupAssignments.animalId, animalId), isNull(animalGroupAssignments.endedOn))).limit(1);
    const [previousGroup] = await db.select().from(animalGroupAssignments).where(and(
      eq(animalGroupAssignments.animalId, animalId),
      eq(animalGroupAssignments.endedOn, latest.changedOn),
    )).orderBy(desc(animalGroupAssignments.startedOn)).limit(1);
    if (currentGroup && currentGroup.startedOn !== latest.changedOn) {
      return fail('O lote já mudou depois desta situação. Corrija o lote antes de desfazer.', 409, 'STATUS_UNDO_GROUP_CHANGED');
    }
    if (latest.status === 'LACTATING' && !currentGroup) {
      return fail('O lote já mudou depois desta situação. Corrija o lote antes de desfazer.', 409, 'STATUS_UNDO_GROUP_CHANGED');
    }
    if (latest.previousStatus === 'LACTATING' && !previousGroup) {
      return fail('O histórico de lote mudou depois desta situação e impede o desfazimento seguro.', 409, 'STATUS_UNDO_GROUP_CHANGED');
    }
    const [calf] = latest.status === 'LACTATING'
      ? await db.select({ id: animals.id }).from(animals)
        .innerJoin(animalStatusEvents, eq(animalStatusEvents.animalId, animals.id))
        .where(and(
          eq(animals.damId, animalId),
          eq(animalStatusEvents.status, 'CALF'),
          isNull(animalStatusEvents.previousStatus),
          eq(animalStatusEvents.changedOn, latest.changedOn),
        )).limit(1)
      : [];
    if (calf) return fail('Este parto registrou um bezerro. Exclua o cadastro do bezerro antes de desfazer.', 409, 'CALVING_HAS_CALF');
    const [exit] = await db.select().from(animalExits).where(eq(animalExits.statusEventId, latest.id)).limit(1);
    if (exit) {
      const linkedDocuments = await db.select({ id: attachments.id }).from(attachments).where(or(
        eq(attachments.animalExitId, exit.id),
        exit.revenueId ? eq(attachments.revenueId, exit.revenueId) : sql`false`,
      )).limit(1);
      if (linkedDocuments.length) return fail('A saída possui documento vinculado. Remova o documento antes de desfazer.', 409, 'EXIT_HAS_DOCUMENTS');
    }
    await db.transaction(async (tx) => {
      if (currentGroup) {
        await tx.delete(animalGroupAssignments).where(eq(animalGroupAssignments.id, currentGroup.id));
      }
      if (previousGroup) {
        await tx.update(animalGroupAssignments).set({ endedOn: null }).where(eq(animalGroupAssignments.id, previousGroup.id));
      }
      await tx.update(animals).set({ status: latest.previousStatus!, updatedAt: new Date() }).where(eq(animals.id, animalId));
      if (exit?.revenueCreatedHere && exit.revenueId) await tx.delete(revenues).where(eq(revenues.id, exit.revenueId));
      await tx.delete(animalStatusEvents).where(eq(animalStatusEvents.id, latest.id));
    });
    return c.json({ deleted: true, restoredStatus: latest.previousStatus });
  })
  .post('/animals/:id/reproductive-events', async (c) => {
    const animalId = c.req.param('id');
    const body = validate(reproductiveEventSchema, await readJson(c));
    if (body.occurredOn > today() || (body.outcomeRecordedOn && body.outcomeRecordedOn > today())) {
      return fail('As datas de reprodução não podem estar no futuro.', 400, 'FUTURE_REPRODUCTIVE_DATE');
    }
    const [animal] = await getDb().select({ id: animals.id }).from(animals).where(eq(animals.id, animalId)).limit(1);
    if (!animal) return fail('Animal não encontrado.', 404, 'NOT_FOUND');
    const bullError = await validateBull(body.bullId);
    if (bullError) return fail(bullError, 400, 'INVALID_BULL');
    const [created] = await getDb().insert(animalReproductiveEvents).values({
      animalId,
      type: 'HEAT',
      ...normalizedReproductiveEvent(body),
    }).returning();
    return c.json(created, 201);
  })
  .patch('/animals/:id/reproductive-events/:eventId', async (c) => {
    const animalId = c.req.param('id');
    const eventId = c.req.param('eventId');
    const body = validate(reproductiveEventSchema, await readJson(c));
    if (body.occurredOn > today() || (body.outcomeRecordedOn && body.outcomeRecordedOn > today())) {
      return fail('As datas de reprodução não podem estar no futuro.', 400, 'FUTURE_REPRODUCTIVE_DATE');
    }
    const [existing] = await getDb().select().from(animalReproductiveEvents).where(and(
      eq(animalReproductiveEvents.id, eventId),
      eq(animalReproductiveEvents.animalId, animalId),
    )).limit(1);
    if (!existing) return fail('Registro reprodutivo não encontrado.', 404, 'NOT_FOUND');
    if (existing.type !== 'HEAT' || existing.statusEventId) return fail('O parto deve ser corrigido pela situação produtiva.', 409, 'CALVING_MANAGED_BY_STATUS');
    const bullError = await validateBull(body.bullId);
    if (bullError) return fail(bullError, 400, 'INVALID_BULL');
    const [updated] = await getDb().update(animalReproductiveEvents).set({
      ...normalizedReproductiveEvent(body),
      updatedAt: new Date(),
    }).where(eq(animalReproductiveEvents.id, eventId)).returning();
    return c.json(updated);
  })
  .delete('/animals/:id/reproductive-events/:eventId', async (c) => {
    const [existing] = await getDb().select().from(animalReproductiveEvents).where(and(
      eq(animalReproductiveEvents.id, c.req.param('eventId')),
      eq(animalReproductiveEvents.animalId, c.req.param('id')),
    )).limit(1);
    if (!existing) return fail('Registro reprodutivo não encontrado.', 404, 'NOT_FOUND');
    if (existing.type !== 'HEAT' || existing.statusEventId) return fail('O parto deve ser corrigido pela situação produtiva.', 409, 'CALVING_MANAGED_BY_STATUS');
    await getDb().delete(animalReproductiveEvents).where(eq(animalReproductiveEvents.id, existing.id));
    return c.json({ deleted: true });
  })
  .post('/animals/:id/group-assignments', async (c) => {
    const animalId = c.req.param('id');
    const body = validate(z.object({ groupId: z.string().uuid(), startedOn: z.string().date(), notes: optionalText }), await readJson(c));
    const [animal] = await getDb().select({ status: animals.status }).from(animals).where(eq(animals.id, animalId)).limit(1);
    if (!animal) return fail('Animal não encontrado.', 404, 'NOT_FOUND');
    if (!isLiveStatus(animal.status)) return fail('Animal que saiu do rebanho não entra em lote.', 409, 'ANIMAL_NOT_ALIVE');
    const group = await getActiveGroup(body.groupId);
    if (!group) return fail('Lote ativo não encontrado.', 404, 'NOT_FOUND');
    if (!statusMatchesGroupRoutine(animal.status, group.milkingRoutine)) return fail(groupForStatusError(animal.status), 409, 'GROUP_ROUTINE_MISMATCH');
    const [current] = await getDb().select().from(animalGroupAssignments).where(and(eq(animalGroupAssignments.animalId, animalId), isNull(animalGroupAssignments.endedOn))).limit(1);
    if (current?.groupId === body.groupId) return fail('O animal já pertence a este lote.', 409, 'SAME_GROUP');
    if (current && body.startedOn < current.startedOn) return fail('A mudança não pode ser anterior à entrada no lote atual.', 400, 'INVALID_GROUP_DATE');
    const created = await getDb().transaction(async (tx) => {
      if (current) await tx.update(animalGroupAssignments).set({ endedOn: body.startedOn }).where(eq(animalGroupAssignments.id, current.id));
      const [assignment] = await tx.insert(animalGroupAssignments).values({ animalId, ...body }).returning();
      return assignment;
    });
    return c.json(created, 201);
  })
  .post('/animals/:id/aliases', async (c) => {
    const body = validate(z.object({ alias: z.string().trim().min(1).max(120) }), await readJson(c));
    try {
      const [created] = await getDb().insert(animalAliases).values({ animalId: c.req.param('id'), alias: body.alias, normalizedAlias: normalizeLabel(body.alias) }).returning();
      return c.json(created, 201);
    } catch {
      return fail('Este alias já existe para o animal.', 409, 'DUPLICATE_ALIAS');
    }
  })
  .delete('/animal-aliases/:id', async (c) => {
    const [removed] = await getDb().delete(animalAliases).where(eq(animalAliases.id, c.req.param('id'))).returning();
    if (!removed) return fail('Alias não encontrado.', 404, 'NOT_FOUND');
    return c.json({ deleted: true });
  });
