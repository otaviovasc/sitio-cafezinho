import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '../../src/domain/game/geometry';
import { herdClusterLayout } from '../../src/domain/game/herd-layout';
import { buildHerdState, type GameMapZone } from '../../src/domain/game/state';

const pasture = [
  { x: 100, y: 100 },
  { x: 400, y: 120 },
  { x: 420, y: 380 },
  { x: 120, y: 400 },
];

describe('herdClusterLayout', () => {
  it('é determinístico: mesma entrada, mesmas posições', () => {
    const a = herdClusterLayout(pasture, 5, 'lote-1');
    const b = herdClusterLayout(pasture, 5, 'lote-1');
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });

  it('seeds diferentes geram arranjos diferentes', () => {
    const a = herdClusterLayout(pasture, 5, 'lote-1');
    const b = herdClusterLayout(pasture, 5, 'lote-2');
    expect(a).not.toEqual(b);
  });

  it('todos os pontos caem dentro do polígono', () => {
    for (const point of herdClusterLayout(pasture, 8, 'lote-3')) {
      expect(pointInPolygon(point, pasture)).toBe(true);
    }
  });

  it('capa em 8 sprites mesmo com 100 animais', () => {
    expect(herdClusterLayout(pasture, 100, 'lote-grande')).toHaveLength(8);
  });

  it('rebanho vazio não desenha nada', () => {
    expect(herdClusterLayout(pasture, 0, 'lote-vazio')).toEqual([]);
  });
});

describe('buildHerdState', () => {
  const zones: GameMapZone[] = [
    { id: 'z-per', kind: 'PERIMETER', name: 'Sítio', pastureId: null, herdGroupId: null, ring: [], styleVariant: 0 },
    { id: 'z-1', kind: 'PASTURE', name: 'Pasto 1', pastureId: 'p-1', herdGroupId: 'g-1', ring: [], styleVariant: 0 },
  ];
  const groups = [
    { id: 'g-1', name: 'Lote 1', active: true },
    { id: 'g-2', name: 'Lote 2', active: true },
    { id: 'g-off', name: 'Antigo', active: false },
  ];

  it('conta animais vivos por lote e aponta a zona vinculada', () => {
    const { herd, unassignedCount } = buildHerdState(
      [
        { id: 'a-1', status: 'LACTATING' },
        { id: 'a-2', status: 'DRY' },
        { id: 'a-3', status: 'LACTATING' },
        { id: 'a-4', status: 'SOLD' },
      ],
      [
        { animalId: 'a-1', groupId: 'g-1' },
        { animalId: 'a-2', groupId: 'g-1' },
        { animalId: 'a-3', groupId: 'g-2' },
        { animalId: 'a-4', groupId: 'g-1' },
      ],
      groups,
      zones,
    );
    const lote1 = herd.find((entry) => entry.groupId === 'g-1');
    expect(lote1).toMatchObject({ zoneId: 'z-1', animalCount: 2, lactatingCount: 1 });
    // a-3 é de lote sem pasto → curral; vendido não conta.
    expect(unassignedCount).toBe(1);
    expect(herd.some((entry) => entry.groupId === 'g-off')).toBe(false);
  });

  it('animal vivo sem lote vai para o curral', () => {
    const { unassignedCount } = buildHerdState(
      [{ id: 'a-1', status: 'HEIFER' }],
      [],
      groups,
      zones,
    );
    expect(unassignedCount).toBe(1);
  });

  it('crias, recria e touros contam como animais vivos', () => {
    const { herd } = buildHerdState(
      [
        { id: 'a-1', status: 'CALF' },
        { id: 'a-2', status: 'GROWING' },
        { id: 'a-3', status: 'BULL' },
        { id: 'a-4', status: 'DEAD' },
      ],
      [
        { animalId: 'a-1', groupId: 'g-1' },
        { animalId: 'a-2', groupId: 'g-1' },
        { animalId: 'a-3', groupId: 'g-1' },
        { animalId: 'a-4', groupId: 'g-1' },
      ],
      groups,
      zones,
    );
    expect(herd.find((entry) => entry.groupId === 'g-1')?.animalCount).toBe(3);
  });
});
