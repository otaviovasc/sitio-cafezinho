import { and, desc, eq, gt, isNull, lte, ne, or } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { animalGroupAssignments, animals, animalStatusEvents, herdGroups, milkMeasurements, milkSessions } from '../../db/schema.js';
import { decimalString } from '../../domain/format.js';
import { requiresAfternoonMeasurement } from '../../domain/herd.js';
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
  notes?: string | null;
};

export type MilkSessionDraft = {
  sessionDate: string;
  title?: string | null;
  inputMode: 'SEPARATE_MORNING_AFTERNOON' | 'COMBINED_TOTAL' | 'MIXED';
  source: 'MANUAL' | 'CHATGPT_IMPORT' | 'NOTEBOOK_SEED';
  notes?: string | null;
  measurements: MeasurementDraft[];
};

export async function loadMilkingHerdOnDate(sessionDate: string) {
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
    .where(ne(herdGroups.milkingRoutine, 'NOT_MILKED'));
  const events = await getDb().select().from(animalStatusEvents)
    .where(lte(animalStatusEvents.changedOn, sessionDate))
    .orderBy(desc(animalStatusEvents.changedOn), desc(animalStatusEvents.createdAt));
  return candidates.filter((animal) => (events.find((event) => event.animalId === animal.id)?.status ?? animal.currentStatus) === 'LACTATING');
}

export async function createMilkSession(draft: MilkSessionDraft) {
  const [sameDate] = await getDb().select({ id: milkSessions.id }).from(milkSessions).where(eq(milkSessions.sessionDate, draft.sessionDate)).limit(1);
  if (sameDate) return fail('Já existe um controle individual nesta data.', 409, 'SESSION_DATE_EXISTS');

  if (draft.source === 'MANUAL' || draft.source === 'CHATGPT_IMPORT') {
    if (draft.inputMode !== 'SEPARATE_MORNING_AFTERNOON') return fail('O controle manual deve registrar manhã e tarde.', 400, 'SEPARATE_VALUES_REQUIRED');
    const producingAnimals = await loadMilkingHerdOnDate(draft.sessionDate);
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
      title: draft.title ?? null,
      inputMode: draft.inputMode,
      source: draft.source,
      notes: draft.notes ?? null,
    }).returning();
    await tx.insert(milkMeasurements).values(draft.measurements.map((row) => ({
      milkSessionId: session.id,
      animalId: row.animalId ?? null,
      rawAnimalLabel: row.rawAnimalLabel,
      rawValueText: row.rawValueText ?? null,
      morningLiters: row.morningLiters == null ? null : decimalString(row.morningLiters),
      afternoonLiters: row.afternoonLiters == null ? null : decimalString(row.afternoonLiters),
      totalLiters: row.totalLiters === null ? null : decimalString(row.totalLiters),
      confidence: row.confidence ?? 'HIGH',
      status: row.status ?? 'CONFIRMED',
      notes: row.notes ?? null,
    })));
    return session;
  });
}
