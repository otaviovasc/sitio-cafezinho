import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { herdGroups, mapZones, pastureOccupancies, pastures, type Pasture } from '../../db/schema.js';
import { pointInPolygon, ringAreaHa, ringError } from '../../domain/game/geometry.js';
import { subdivisionName } from '../../domain/pastures.js';
import type { MapPoint } from '../../domain/game/state.js';
import { fail, ApiError } from '../http/api-error.js';

export { subdivisionName };

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

/** Limites da subdivisão guiada: pelo menos duas áreas novas, no máximo oito. */
export const SUBDIVISION_MIN_RINGS = 2;
export const SUBDIVISION_MAX_RINGS = 8;

export type SubdivisionPiece = { name: string; areaHa: string; ring: MapPoint[] };

/**
 * Planeja a subdivisão de um pasto (função pura, testável): cada anel vira um
 * pasto novo com nome de linhagem e a área medida pelo próprio traçado.
 */
export function planSubdivision(baseName: string, rings: MapPoint[][]): SubdivisionPiece[] {
  if (rings.length < SUBDIVISION_MIN_RINGS) return fail('Desenhe pelo menos duas áreas para subdividir o pasto.', 400, 'SUBDIVISION_MIN_RINGS');
  if (rings.length > SUBDIVISION_MAX_RINGS) return fail(`Subdivida em no máximo ${SUBDIVISION_MAX_RINGS} áreas por vez.`, 400, 'SUBDIVISION_MAX_RINGS');
  return rings.map((ring, index) => {
    const invalid = ringError(ring);
    if (invalid) return fail(`Área ${index + 1}: ${invalid}`, 400, 'INVALID_RING');
    return { name: subdivisionName(baseName, index), areaHa: ringAreaHa(ring).toFixed(2), ring };
  });
}

/**
 * Subdivide um pasto desenhado no mapa (regra de domínio: subdividir desativa
 * o original e cria os novos, com a linhagem no nome, sem hierarquia). Numa
 * única transação: desativa o pasto e a zona que o desenhava, cria os pastos
 * novos já com a área medida pelo traçado e uma zona PASTURE para cada um.
 * Pasto ocupado não pode ser desativado — o lote precisa ser movido antes.
 */
export async function subdividePasture(pastureId: string, rings: MapPoint[][]) {
  const db = getDb();
  const [pasture] = await db.select().from(pastures).where(eq(pastures.id, pastureId)).limit(1);
  if (!pasture) return fail('Pasto não encontrado.', 404, 'PASTURE_NOT_FOUND');
  if (!pasture.active) return fail('Este pasto já está desativado.', 409, 'PASTURE_INACTIVE');
  const [open] = await db.select({ id: pastureOccupancies.id }).from(pastureOccupancies)
    .where(and(eq(pastureOccupancies.pastureId, pastureId), isNull(pastureOccupancies.endedOn))).limit(1);
  if (open) return fail('Este pasto está ocupado. Mova o lote para outro pasto antes de subdividir.', 409, 'PASTURE_OCCUPIED');
  const pieces = planSubdivision(pasture.name, rings);
  const [perimeter] = await db.select({ ring: mapZones.ring }).from(mapZones)
    .where(and(eq(mapZones.kind, 'PERIMETER'), eq(mapZones.active, true))).limit(1);
  if (perimeter) {
    const perimeterRing = (perimeter.ring as MapPoint[]).map((vertex) => ({ x: vertex.lng, y: vertex.lat }));
    for (const piece of pieces) {
      const inside = piece.ring.every((point) => pointInPolygon({ x: point.lng, y: point.lat }, perimeterRing));
      if (!inside) return fail('As novas áreas precisam ficar inteiras dentro do perímetro do sítio.', 400, 'PASTURE_OUTSIDE_PERIMETER');
    }
  }
  try {
    return await db.transaction(async (tx) => {
      await tx.update(pastures).set({ active: false, updatedAt: new Date() }).where(eq(pastures.id, pastureId));
      // A zona que desenhava o pasto original sai do mapa junto com ele.
      await tx.update(mapZones).set({ active: false, updatedAt: new Date() })
        .where(and(eq(mapZones.pastureId, pastureId), eq(mapZones.active, true)));
      const [zoneCount] = await tx.select({ count: sql<number>`count(*)::int` }).from(mapZones)
        .where(and(eq(mapZones.kind, 'PASTURE'), eq(mapZones.active, true)));
      const created: Pasture[] = [];
      for (const [index, piece] of pieces.entries()) {
        const [newPasture] = await tx.insert(pastures).values({ name: piece.name, areaHa: piece.areaHa }).returning();
        await tx.insert(mapZones).values({
          kind: 'PASTURE',
          name: piece.name,
          pastureId: newPasture.id,
          ring: piece.ring,
          styleVariant: (Number(zoneCount.count) + index) % 3,
        });
        created.push(newPasture);
      }
      return created;
    });
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    return fail('Já existe um pasto com um dos nomes da subdivisão. Renomeie o pasto antigo antes de subdividir.', 409, 'DUPLICATE_PASTURE');
  }
}

export async function listPastureOccupancies(pastureId: string) {  const db = getDb();  const [pasture] = await db.select({ id: pastures.id }).from(pastures).where(eq(pastures.id, pastureId)).limit(1);
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
