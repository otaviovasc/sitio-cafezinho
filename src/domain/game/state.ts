import type { GameEconomy } from './economy.js';
import type { PlantingGrowthStage } from './planting.js';

/**
 * Contrato do estado do jogo, compartilhado entre servidor e cliente. O
 * servidor monta este shape em GET /api/game/state; o cliente só exibe.
 * Cresce por fase (mapa → rebanho → ordenha → economia/streaks).
 */

export type MapPoint = { lat: number; lng: number };

export type MapZoneKind = 'PERIMETER' | 'PASTURE';
export type MapInstallationKind = 'MANGUEIRA' | 'DEPOSITO' | 'GARAGEM' | 'CASA' | 'ESTACAO_ALIMENTACAO' | 'PLANTACAO';

export type GameMapZone = {
  id: string;
  kind: MapZoneKind;
  name: string;
  /** Pasto real que a zona desenha (tabela pastures). */
  pastureId: string | null;
  /**
   * Lote exibido dentro da zona — DERIVADO da ocupação atual do pasto
   * (pasture_occupancies aberta), nunca de vínculo próprio da zona.
   * null = pasto sem lote no momento.
   */
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
  /** Zona que desenha o pasto onde o lote está (ocupação atual); null = lote fora de pasto no mapa. */
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

export type GamePlantingInput = { name: string; quantity: number; unit: string };

/** Ciclo ativo da Plantação: o progresso vem do relógio, nunca do banco. */
export type GamePlanting = {
  id: string;
  installationId: string;
  cropName: string;
  plantedAt: string;
  durationHours: number;
  readyAt: string;
  /** Snapshot 0–1 no momento da resposta; o cliente re-deriva a cada tick. */
  progress: number;
  stage: PlantingGrowthStage;
  inputs: GamePlantingInput[];
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
  /** Plantio em andamento na Plantação; null = talhão vazio ou sem instalação. */
  planting: GamePlanting | null;
};

/** Monta o resumo do rebanho a partir das linhas cruas (função pura, testável). */
export function buildHerdState(
  animals: Array<{ id: string; status: string }>,
  assignments: Array<{ animalId: string; groupId: string }>,
  groups: Array<{ id: string; name: string; active: boolean }>,
  zones: GameMapZone[],
): { herd: GameHerdGroup[]; unassignedCount: number } {
  const aliveStatuses = new Set(['HEIFER', 'LACTATING', 'DRY', 'CALF', 'GROWING', 'BULL']);
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
