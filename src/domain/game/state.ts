import type { GameEconomy } from './economy.js';

/**
 * Contrato do estado do jogo, compartilhado entre servidor e cliente. O
 * servidor monta este shape em GET /api/game/state; o cliente só exibe.
 * Cresce por fase (mapa → rebanho → ordenha → economia/streaks).
 */

export type MapPoint = { lat: number; lng: number };

export type MapZoneKind = 'PERIMETER' | 'PASTURE';
export type MapInstallationKind = 'MANGUEIRA' | 'DEPOSITO' | 'GARAGEM' | 'CASA' | 'ESTACAO_ALIMENTACAO';

export type GameMapZone = {
  id: string;
  kind: MapZoneKind;
  name: string;
  herdGroupId: string | null;
  ring: MapPoint[];
  styleVariant: number;
};

export type GameMapInstallation = {
  id: string;
  kind: MapInstallationKind;
  name: string;
  position: MapPoint;
};

export type GameMapState = {
  zones: GameMapZone[];
  installations: GameMapInstallation[];
};

/** Resumo de um lote para o tabuleiro: onde desenhar e quantas vacas mostrar. */
export type GameHerdGroup = {
  groupId: string;
  groupName: string;
  /** Zona (pasto) vinculada ao lote; null = lote ainda sem pasto no mapa. */
  zoneId: string | null;
  animalCount: number;
  lactatingCount: number;
};

/** O dia operacional na mangueira: produção, coletas e o nível do tanque. */
export type GameToday = {
  date: string;
  /** Produção registrada hoje (total geral ou soma de lotes); null = nada ainda. */
  producedLiters: number | null;
  collectedLiters: number;
  collectionCount: number;
  hasDailyTotal: boolean;
  /** Fração 0–1 do leite de hoje ainda no tanque (domain/game/tank.ts). */
  tankLevel: number;
};

export type GameStreaks = {
  dailyMilk: { current: number; best: number };
  collections: { current: number; best: number };
};

export type GameState = {
  map: GameMapState;
  herd: GameHerdGroup[];
  /** Animais vivos sem lote, ou de lote sem pasto no mapa — vão para o curral. */
  unassignedCount: number;
  today: GameToday;
  economy: GameEconomy;
  streaks: GameStreaks;
};

/** Monta o resumo do rebanho a partir das linhas cruas (função pura, testável). */
export function buildHerdState(
  animals: Array<{ id: string; status: string }>,
  assignments: Array<{ animalId: string; groupId: string }>,
  groups: Array<{ id: string; name: string; active: boolean }>,
  zones: GameMapZone[],
): { herd: GameHerdGroup[]; unassignedCount: number } {
  const aliveStatuses = new Set(['HEIFER', 'LACTATING', 'DRY']);
  const alive = animals.filter((animal) => aliveStatuses.has(animal.status));
  const aliveIds = new Set(alive.map((animal) => animal.id));
  const lactatingIds = new Set(alive.filter((animal) => animal.status === 'LACTATING').map((animal) => animal.id));
  const zoneByGroup = new Map(zones.filter((zone) => zone.kind === 'PASTURE' && zone.herdGroupId).map((zone) => [zone.herdGroupId!, zone.id]));

  const herd: GameHerdGroup[] = groups.filter((group) => group.active).map((group) => {
    const members = assignments.filter((assignment) => assignment.groupId === group.id && aliveIds.has(assignment.animalId));
    return {
      groupId: group.id,
      groupName: group.name,
      zoneId: zoneByGroup.get(group.id) ?? null,
      animalCount: members.length,
      lactatingCount: members.filter((assignment) => lactatingIds.has(assignment.animalId)).length,
    };
  });

  const mappedGroupIds = new Set(herd.filter((entry) => entry.zoneId).map((entry) => entry.groupId));
  const assignmentByAnimal = new Map(assignments.map((assignment) => [assignment.animalId, assignment.groupId]));
  const unassignedCount = alive.filter((animal) => {
    const groupId = assignmentByAnimal.get(animal.id);
    return !groupId || !mappedGroupIds.has(groupId);
  }).length;

  return { herd, unassignedCount };
}
