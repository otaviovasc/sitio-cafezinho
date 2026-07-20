import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { herdGroups, pastureOccupancies, pastures, type Pasture } from '../../db/schema.js';
import { ringAreaHa } from '../../domain/game/geometry.js';
import type { MapPoint } from '../../domain/game/state.js';
import { fail } from '../http/api-error.js';

/**
 * Regras de pasto: exclusividade (um lote por pasto e um pasto por lote, por
 * vez) e derivação de dias de uso/descanso. Dias são sempre a diferença entre
 * datas registradas — nunca interpolamos dias sem fato.
 */

/** Diferença em dias entre duas datas ISO (YYYY-MM-DD). */
export function daysBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type PastureOccupancyRow = {
  id: string;
  pastureId: string;
  herdGroupId: string;
  startedOn: string;
  endedOn: string | null;
};

export type PastureSummary = {
  id: string;
  name: string;
  areaHa: string | null;
  active: boolean;
  currentOccupancy: {
    occupancyId: string;
    herdGroupId: string;
    herdGroupName: string;
    startedOn: string;
    occupiedDays: number;
  } | null;
  /** Pasto livre: dias desde a última ocupação encerrada; null = nunca ocupado. */
  restDays: number | null;
};

/** Monta o resumo dos pastos a partir das linhas cruas (função pura, testável). */
export function summarizePastures(
  pastureRows: Array<Pick<Pasture, 'id' | 'name' | 'areaHa' | 'active'>>,
  occupancyRows: PastureOccupancyRow[],
  groups: Array<{ id: string; name: string }>,
  today: string,
): PastureSummary[] {
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  return pastureRows.map((pasture) => {
    const occupancies = occupancyRows.filter((row) => row.pastureId === pasture.id);
    const open = occupancies.find((row) => row.endedOn === null) ?? null;
    if (open) {
      return {
        ...pasture,
        currentOccupancy: {
          occupancyId: open.id,
          herdGroupId: open.herdGroupId,
          herdGroupName: groupNameById.get(open.herdGroupId) ?? 'Lote',
          startedOn: open.startedOn,
          occupiedDays: daysBetween(open.startedOn, today),
        },
        restDays: null,
      };
    }
    const lastEndedOn = occupancies
      .map((row) => row.endedOn)
      .filter((endedOn): endedOn is string => endedOn !== null)
      .sort()
      .at(-1) ?? null;
    return { ...pasture, currentOccupancy: null, restDays: lastEndedOn ? daysBetween(lastEndedOn, today) : null };
  });
}

export type PastureMovePlan = {
  /** Ocupação do lote a fechar com ended_on = movedOn (null = lote estava fora de pasto). */
  closeOccupancyId: string | null;
  /** Nova ocupação a abrir (null = retirada sem destino). */
  insert: { pastureId: string; herdGroupId: string; startedOn: string } | null;
  /** Lote já estava no pasto de destino — nada a fazer. */
  noop: boolean;
};

/**
 * Decide o efeito de mover um lote para um pasto (ou retirá-lo, pastureId =
 * null) a partir das linhas já carregadas (função pura, testável). Aplica as
 * rejeições de exclusividade e de data.
 */
export function planPastureMove(input: {
  groupId: string;
  pastureId: string | null;
  movedOn: string;
  pasture: { id: string; active: boolean } | null;
  groupOpenOccupancy: Pick<PastureOccupancyRow, 'id' | 'pastureId' | 'startedOn'> | null;
  pastureOpenOccupancy: Pick<PastureOccupancyRow, 'herdGroupId'> | null;
}): PastureMovePlan {
  if (input.pastureId !== null) {
    if (!input.pasture) return fail('Pasto não encontrado.', 404, 'PASTURE_NOT_FOUND');
    if (!input.pasture.active) return fail('Este pasto está desativado. Ative-o ou escolha outro.', 409, 'PASTURE_INACTIVE');
    if (input.pastureOpenOccupancy && input.pastureOpenOccupancy.herdGroupId !== input.groupId) {
      return fail('Este pasto já está ocupado por outro lote. Retire o lote atual primeiro.', 409, 'PASTURE_OCCUPIED');
    }
    if (input.groupOpenOccupancy?.pastureId === input.pastureId) {
      return { closeOccupancyId: null, insert: null, noop: true };
    }
  }
  if (input.groupOpenOccupancy && input.movedOn < input.groupOpenOccupancy.startedOn) {
    return fail('A data da movimentação não pode ser anterior ao início da ocupação atual.', 400, 'INVALID_MOVE_DATE');
  }
  return {
    closeOccupancyId: input.groupOpenOccupancy?.id ?? null,
    insert: input.pastureId
      ? { pastureId: input.pastureId, herdGroupId: input.groupId, startedOn: input.movedOn }
      : null,
    noop: false,
  };
}

export async function listPastureSummaries(today: string): Promise<PastureSummary[]> {
  const db = getDb();
  const [pastureRows, occupancyRows, groupRows] = await Promise.all([
    db.select().from(pastures).orderBy(asc(pastures.name)),
    db.select({
      id: pastureOccupancies.id,
      pastureId: pastureOccupancies.pastureId,
      herdGroupId: pastureOccupancies.herdGroupId,
      startedOn: pastureOccupancies.startedOn,
      endedOn: pastureOccupancies.endedOn,
    }).from(pastureOccupancies),
    db.select({ id: herdGroups.id, name: herdGroups.name }).from(herdGroups),
  ]);
  return summarizePastures(pastureRows, occupancyRows, groupRows, today);
}

/**
 * Grava no pasto a área medida pelo anel desenhado no mapa (hectares). O
 * traçado é a medição oficial: substitui qualquer valor digitado à mão.
 */
export async function syncPastureAreaFromRing(pastureId: string, ring: MapPoint[]) {
  await getDb().update(pastures)
    .set({ areaHa: ringAreaHa(ring).toFixed(2), updatedAt: new Date() })
    .where(eq(pastures.id, pastureId));
}

export async function listPastureOccupancies(pastureId: string) {  const db = getDb();
  const [pasture] = await db.select({ id: pastures.id }).from(pastures).where(eq(pastures.id, pastureId)).limit(1);
  if (!pasture) return fail('Pasto não encontrado.', 404, 'NOT_FOUND');
  const rows = await db.select({
    id: pastureOccupancies.id,
    herdGroupId: pastureOccupancies.herdGroupId,
    herdGroupName: herdGroups.name,
    startedOn: pastureOccupancies.startedOn,
    endedOn: pastureOccupancies.endedOn,
    notes: pastureOccupancies.notes,
  }).from(pastureOccupancies)
    .innerJoin(herdGroups, eq(herdGroups.id, pastureOccupancies.herdGroupId))
    .where(eq(pastureOccupancies.pastureId, pastureId))
    .orderBy(asc(pastureOccupancies.startedOn));
  return rows.reverse();
}

/**
 * Move o lote para um pasto em uma data (pastureId null = retirar do pasto,
 * sem destino). Fecha a ocupação aberta do lote e abre a nova; as rejeições
 * de exclusividade/data vêm de planPastureMove.
 */
export async function moveGroupToPasture(groupId: string, pastureId: string | null, movedOn: string, notes: string | null = null) {
  const db = getDb();
  const [group] = await db.select({ id: herdGroups.id }).from(herdGroups).where(eq(herdGroups.id, groupId)).limit(1);
  if (!group) return fail('Lote não encontrado.', 404, 'GROUP_NOT_FOUND');

  const [pasture] = pastureId
    ? await db.select({ id: pastures.id, active: pastures.active }).from(pastures).where(eq(pastures.id, pastureId)).limit(1)
    : [null];
  const [groupOpenOccupancy] = await db.select({
    id: pastureOccupancies.id,
    pastureId: pastureOccupancies.pastureId,
    startedOn: pastureOccupancies.startedOn,
  }).from(pastureOccupancies)
    .where(and(eq(pastureOccupancies.herdGroupId, groupId), isNull(pastureOccupancies.endedOn))).limit(1);
  const [pastureOpenOccupancy] = pastureId
    ? await db.select({ herdGroupId: pastureOccupancies.herdGroupId }).from(pastureOccupancies)
      .where(and(eq(pastureOccupancies.pastureId, pastureId), isNull(pastureOccupancies.endedOn))).limit(1)
    : [null];

  const plan = planPastureMove({
    groupId,
    pastureId,
    movedOn,
    pasture: pasture ?? null,
    groupOpenOccupancy: groupOpenOccupancy ?? null,
    pastureOpenOccupancy: pastureOpenOccupancy ?? null,
  });

  if (plan.noop) {
    const [current] = await db.select().from(pastureOccupancies)
      .where(eq(pastureOccupancies.id, groupOpenOccupancy!.id)).limit(1);
    return current;
  }
  let closed = null;
  if (plan.closeOccupancyId) {
    [closed] = await db.update(pastureOccupancies)
      .set({ endedOn: movedOn, updatedAt: new Date() })
      .where(eq(pastureOccupancies.id, plan.closeOccupancyId)).returning();
  }
  if (plan.insert) {
    const [created] = await db.insert(pastureOccupancies).values({ ...plan.insert, notes }).returning();
    return created;
  }
  return closed;
}
