import { and, desc, eq, gt, isNull, lte, ne, or } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { animalGroupAssignments, animals, animalStatusEvents, herdGroups, milkMeasurements, milkMeasurementSources, milkSessions } from '../../db/schema.js';
import { decimalString } from '../../domain/format.js';
import { requiresAfternoonMeasurement } from '../../domain/herd.js';
import { planMilkSessionMerge, type MilkMergeDecision } from '../../domain/milk-session-merge.js';
import { fail } from '../http/api-error.js';

export type MeasurementDraft = {
  animalId?: string | null;
  rawAnimalLabel: string;
  rawValueText?: string | null;
  morningLiters?: number | null;
  afternoonLiters?: number | null;
  totalLiters: number | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  status?: 'CONFIRMED' | 'NEEDS_REVIEW' | 'EXCLUDED';
  mergeDecision?: MilkMergeDecision | null;
  notes?: string | null;
  sources?: MeasurementSourceDraft[];
};

export type MeasurementSourceDraft = {
  captureId?: string | null;
  proposedActionId?: string | null;
  rawAnimalLabel: string;
  rawValueText?: string | null;
  morningLiters?: number | null;
  afternoonLiters?: number | null;
  totalLiters?: number | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  notes?: string | null;
};

export type MilkSessionDraft = {
  sessionDate: string;
  herdGroupId?: string | null;
  title?: string | null;
  inputMode: 'SEPARATE_MORNING_AFTERNOON' | 'COMBINED_TOTAL' | 'MIXED';
  source: 'MANUAL' | 'IMPORT' | 'NOTEBOOK_SEED';
  notes?: string | null;
  measurements: MeasurementDraft[];
};

export async function loadMilkingHerdOnDate(sessionDate: string, herdGroupId?: string | null) {
  const candidates = await getDb().select({
    id: animals.id,
    name: animals.name,
    tagNumber: animals.tagNumber,
    currentStatus: animals.status,
    milkingRoutine: herdGroups.milkingRoutine,
  }).from(animals)
    .innerJoin(animalGroupAssignments, and(
      eq(animalGroupAssignments.animalId, animals.id),
      lte(animalGroupAssignments.startedOn, sessionDate),
      or(isNull(animalGroupAssignments.endedOn), gt(animalGroupAssignments.endedOn, sessionDate)),
    ))
    .innerJoin(herdGroups, eq(animalGroupAssignments.groupId, herdGroups.id))
    .where(herdGroupId
      ? and(ne(herdGroups.milkingRoutine, 'NOT_MILKED'), eq(herdGroups.id, herdGroupId))
      : ne(herdGroups.milkingRoutine, 'NOT_MILKED'));
  const events = await getDb().select().from(animalStatusEvents)
    .where(lte(animalStatusEvents.changedOn, sessionDate))
    .orderBy(desc(animalStatusEvents.changedOn), desc(animalStatusEvents.createdAt));
  return candidates.filter((animal) => (events.find((event) => event.animalId === animal.id)?.status ?? animal.currentStatus) === 'LACTATING');
}

export async function createMilkSession(draft: MilkSessionDraft) {
  const scopeCondition = draft.herdGroupId
    ? eq(milkSessions.herdGroupId, draft.herdGroupId)
    : isNull(milkSessions.herdGroupId);
  const [sameScope] = await getDb().select({ id: milkSessions.id }).from(milkSessions)
    .where(and(eq(milkSessions.sessionDate, draft.sessionDate), scopeCondition)).limit(1);
  if (sameScope) return fail('Já existe um controle individual deste lote nesta data.', 409, 'SESSION_DATE_EXISTS');

  if (draft.source === 'MANUAL' || draft.source === 'IMPORT') {
    if (draft.inputMode !== 'SEPARATE_MORNING_AFTERNOON') return fail('O controle manual deve registrar manhã e tarde.', 400, 'SEPARATE_VALUES_REQUIRED');
    const producingAnimals = await loadMilkingHerdOnDate(draft.sessionDate, draft.herdGroupId);
    const producingIds = new Set(producingAnimals.map((animal) => animal.id));
    const byAnimal = new Map(draft.measurements.map((row) => [row.animalId, row]));
    const missing = producingAnimals.filter((animal) => !byAnimal.has(animal.id));
    if (draft.source === 'MANUAL' && missing.length) {
      const names = missing.slice(0, 3).map((animal) => animal.name || `Brinco ${animal.tagNumber}`).join(', ');
      return fail(`Preencha todas as vacas em lactação. Faltam ${missing.length}: ${names}${missing.length > 3 ? '…' : ''}`, 400, 'INCOMPLETE_HERD_CONTROL');
    }
    const linkedIds = draft.measurements.filter((row) => (row.status ?? 'CONFIRMED') === 'CONFIRMED').map((row) => row.animalId).filter((id): id is string => Boolean(id));
    if (new Set(linkedIds).size !== linkedIds.length) {
      return fail('Cada animal deve aparecer uma única vez no controle.', 400, 'DUPLICATE_ANIMAL_MEASUREMENT');
    }
    if (draft.source === 'MANUAL' && draft.measurements.some((row) => !row.animalId || !producingIds.has(row.animalId))) {
      return fail('O controle manual deve conter somente as vacas atualmente em lactação e em grupos com ordenha.', 400, 'ANIMAL_NOT_IN_PRODUCING_HERD');
    }
    if (draft.source === 'MANUAL' && draft.measurements.some((row) => (row.status ?? 'CONFIRMED') !== 'CONFIRMED')) {
      return fail('Revise todos os valores antes de salvar o controle manual completo.', 400, 'UNCONFIRMED_MANUAL_MEASUREMENT');
    }
    for (const animal of draft.source === 'MANUAL' ? producingAnimals : []) {
      const row = byAnimal.get(animal.id);
      if (!row || ((row.status ?? 'CONFIRMED') === 'CONFIRMED' && row.morningLiters == null)) return fail(`Informe a produção da manhã de ${animal.name || animal.tagNumber}.`, 400, 'MORNING_REQUIRED');
      if ((row.status ?? 'CONFIRMED') === 'CONFIRMED' && requiresAfternoonMeasurement(animal.milkingRoutine) && row.afternoonLiters == null) {
        return fail(`Informe a produção da tarde de ${animal.name || animal.tagNumber}.`, 400, 'AFTERNOON_REQUIRED');
      }
      if ((row.status ?? 'CONFIRMED') === 'CONFIRMED' && !requiresAfternoonMeasurement(animal.milkingRoutine) && row.afternoonLiters != null) {
        return fail(`${animal.name || animal.tagNumber} pertence a um grupo sem ordenha à tarde.`, 400, 'AFTERNOON_NOT_APPLICABLE');
      }
    }
  }
  return getDb().transaction(async (tx) => {
    const [session] = await tx.insert(milkSessions).values({
      sessionDate: draft.sessionDate,
      herdGroupId: draft.herdGroupId ?? null,
      title: draft.title ?? null,
      inputMode: draft.inputMode,
      source: draft.source,
      notes: draft.notes ?? null,
    }).returning();
    const stored = await tx.insert(milkMeasurements).values(draft.measurements.map((row) => storedMeasurement(session.id, row))).returning({ id: milkMeasurements.id });
    for (const [index, measurement] of stored.entries()) {
      const sources = draft.measurements[index].sources ?? [];
      if (sources.length) await tx.insert(milkMeasurementSources).values(sources.map((source) => storedSource(measurement.id, source)));
    }
    return session;
  });
}

function storedMeasurement(sessionId: string, row: MeasurementDraft) {
  return {
    milkSessionId: sessionId,
    animalId: row.animalId ?? null,
    rawAnimalLabel: row.rawAnimalLabel,
    rawValueText: row.rawValueText ?? null,
    morningLiters: row.morningLiters == null ? null : decimalString(row.morningLiters),
    afternoonLiters: row.afternoonLiters == null ? null : decimalString(row.afternoonLiters),
    totalLiters: row.totalLiters === null ? null : decimalString(row.totalLiters),
    confidence: row.confidence ?? 'HIGH' as const,
    status: row.status ?? 'CONFIRMED' as const,
    notes: row.notes ?? null,
  };
}

function storedSource(measurementId: string, source: MeasurementSourceDraft) {
  return {
    milkMeasurementId: measurementId,
    captureId: source.captureId ?? null,
    proposedActionId: source.proposedActionId ?? null,
    rawAnimalLabel: source.rawAnimalLabel,
    rawValueText: source.rawValueText ?? null,
    morningLiters: source.morningLiters == null ? null : decimalString(source.morningLiters),
    afternoonLiters: source.afternoonLiters == null ? null : decimalString(source.afternoonLiters),
    totalLiters: source.totalLiters == null ? null : decimalString(source.totalLiters),
    confidence: source.confidence ?? 'HIGH' as const,
    notes: source.notes ?? null,
  };
}

export async function mergeMilkSession(sessionId: string, draft: MilkSessionDraft) {
  const db = getDb();
  const [session] = await db.select().from(milkSessions).where(eq(milkSessions.id, sessionId)).limit(1);
  if (!session) return fail('Controle não encontrado.', 404, 'NOT_FOUND');
  if (session.sessionDate !== draft.sessionDate) return fail('A data importada não corresponde ao controle existente.', 409, 'SESSION_DATE_MISMATCH');
  if ((session.herdGroupId ?? null) !== (draft.herdGroupId ?? null)) return fail('O lote importado não corresponde ao controle existente.', 409, 'SESSION_GROUP_MISMATCH');
  if (draft.source !== 'IMPORT') return fail('Somente importações revisadas podem completar um controle existente.', 400, 'INVALID_MERGE_SOURCE');
  if (draft.inputMode !== 'SEPARATE_MORNING_AFTERNOON') return fail('O controle importado deve registrar manhã e tarde.', 400, 'SEPARATE_VALUES_REQUIRED');

  const activeIncomingIds = draft.measurements
    .filter((row) => (row.status ?? 'CONFIRMED') !== 'EXCLUDED')
    .map((row) => row.animalId)
    .filter((id): id is string => Boolean(id));
  if (new Set(activeIncomingIds).size !== activeIncomingIds.length) {
    return fail('Cada animal deve aparecer uma única vez nos dados revisados.', 400, 'DUPLICATE_ANIMAL_MEASUREMENT');
  }

  const existing = await db.select({
    id: milkMeasurements.id,
    animalId: milkMeasurements.animalId,
    status: milkMeasurements.status,
    morningLiters: milkMeasurements.morningLiters,
    afternoonLiters: milkMeasurements.afternoonLiters,
  }).from(milkMeasurements).where(eq(milkMeasurements.milkSessionId, sessionId));
  const activeExistingIds = new Set(existing.flatMap((row) => row.animalId && row.status !== 'EXCLUDED' ? [row.animalId] : []));
  if (draft.measurements.some((row) => row.status !== 'EXCLUDED'
    && row.mergeDecision
    && row.mergeDecision !== 'ADD'
    && (!row.animalId || !activeExistingIds.has(row.animalId)))) {
    return fail('A medição existente mudou desde a revisão. Valide os dados novamente antes de salvar.', 409, 'MERGE_TARGET_CHANGED');
  }
  const plan = planMilkSessionMerge(existing, draft.measurements.map((row) => ({
    animalId: row.animalId,
    status: row.status ?? 'CONFIRMED',
    mergeDecision: row.mergeDecision,
  })));
  if (plan.conflicts.length) {
    return fail('Escolha se deseja manter a medição existente ou usar a nova em cada animal repetido.', 409, 'MEASUREMENT_MERGE_CONFLICT');
  }

  return db.transaction(async (tx) => {
    const rowsToInsert: MeasurementDraft[] = [];
    let replacedCount = 0;
    let skippedCount = 0;
    for (const action of plan.actions) {
      if (action.kind === 'SKIP') {
        const sources = draft.measurements[action.incomingIndex].sources ?? [];
        if (sources.length) await tx.insert(milkMeasurementSources).values(sources.map((source) => storedSource(action.existingMeasurementId, source)));
        skippedCount += 1;
        continue;
      }
      if (action.kind === 'COMPLETE') {
        const incoming = draft.measurements[action.incomingIndex];
        const current = existing.find((row) => row.id === action.existingMeasurementId);
        if (!current) return fail('A medição existente mudou desde a revisão.', 409, 'MERGE_TARGET_CHANGED');
        const morning = incoming.morningLiters ?? (current.morningLiters == null ? null : Number(current.morningLiters));
        const afternoon = incoming.afternoonLiters ?? (current.afternoonLiters == null ? null : Number(current.afternoonLiters));
        const total = morning == null && afternoon == null ? null : (morning ?? 0) + (afternoon ?? 0);
        await tx.update(milkMeasurements).set({
          morningLiters: morning == null ? null : decimalString(morning),
          afternoonLiters: afternoon == null ? null : decimalString(afternoon),
          totalLiters: total == null ? null : decimalString(total),
          confidence: incoming.confidence ?? 'HIGH',
          status: incoming.status ?? 'CONFIRMED',
          updatedAt: new Date(),
        }).where(and(eq(milkMeasurements.id, action.existingMeasurementId), eq(milkMeasurements.milkSessionId, sessionId)));
        const sources = incoming.sources ?? [];
        if (sources.length) await tx.insert(milkMeasurementSources).values(sources.map((source) => storedSource(action.existingMeasurementId, source)));
        continue;
      }
      if (action.kind === 'REPLACE') {
        await tx.update(milkMeasurements)
          .set({ status: 'EXCLUDED', updatedAt: new Date() })
          .where(and(eq(milkMeasurements.id, action.existingMeasurementId), eq(milkMeasurements.milkSessionId, sessionId)));
        replacedCount += 1;
      }
      rowsToInsert.push(draft.measurements[action.incomingIndex]);
    }
    if (rowsToInsert.length) {
      const inserted = await tx.insert(milkMeasurements).values(rowsToInsert.map((row) => storedMeasurement(sessionId, row))).returning({ id: milkMeasurements.id });
      for (const [index, measurement] of inserted.entries()) {
        const sources = rowsToInsert[index].sources ?? [];
        if (sources.length) await tx.insert(milkMeasurementSources).values(sources.map((source) => storedSource(measurement.id, source)));
      }
    }
    await tx.update(milkSessions).set({ updatedAt: new Date() }).where(eq(milkSessions.id, sessionId));
    return {
      ...session,
      merged: true as const,
      addedCount: rowsToInsert.length - replacedCount,
      replacedCount,
      skippedCount,
    };
  });
}
