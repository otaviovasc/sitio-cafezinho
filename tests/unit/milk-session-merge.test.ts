import { describe, expect, it } from 'vitest';
import { planMilkSessionMerge } from '../../src/domain/milk-session-merge';

const existing = [
  { id: 'measurement-a', animalId: 'animal-a', status: 'CONFIRMED', morningLiters: 10, afternoonLiters: null },
  { id: 'measurement-excluded', animalId: 'animal-b', status: 'EXCLUDED', morningLiters: 8, afternoonLiters: null },
];

describe('merge de controle individual', () => {
  it('adiciona animais ainda não medidos e ignora medições excluídas como conflito', () => {
    const plan = planMilkSessionMerge(existing, [
      { animalId: 'animal-b', status: 'CONFIRMED', mergeDecision: 'ADD' },
      { animalId: 'animal-c', status: 'CONFIRMED', mergeDecision: 'ADD' },
    ]);

    expect(plan).toEqual({
      actions: [
        { incomingIndex: 0, kind: 'ADD' },
        { incomingIndex: 1, kind: 'ADD' },
      ],
      conflicts: [],
    });
  });

  it('não sobrescreve uma vaca já medida sem decisão humana', () => {
    const plan = planMilkSessionMerge(existing, [
      { animalId: 'animal-a', status: 'CONFIRMED', mergeDecision: null },
    ]);

    expect(plan).toEqual({
      actions: [],
      conflicts: [{ incomingIndex: 0, existingMeasurementId: 'measurement-a' }],
    });
  });

  it('permite manter a medição existente ou substituí-la preservando a linha antiga', () => {
    const keep = planMilkSessionMerge(existing, [
      { animalId: 'animal-a', status: 'CONFIRMED', mergeDecision: 'KEEP_EXISTING' },
    ]);
    const replace = planMilkSessionMerge(existing, [
      { animalId: 'animal-a', status: 'CONFIRMED', mergeDecision: 'REPLACE_EXISTING' },
    ]);

    expect(keep.actions).toEqual([{ incomingIndex: 0, kind: 'SKIP', existingMeasurementId: 'measurement-a' }]);
    expect(replace.actions).toEqual([{ incomingIndex: 0, kind: 'REPLACE', existingMeasurementId: 'measurement-a' }]);
  });

  it('completa automaticamente a tarde sobre uma manhã já registrada', () => {
    const plan = planMilkSessionMerge(existing, [
      {
        animalId: 'animal-a',
        status: 'CONFIRMED',
        morningLiters: null,
        afternoonLiters: 9,
        mergeDecision: null,
      },
    ]);

    expect(plan).toEqual({
      actions: [{ incomingIndex: 0, kind: 'COMPLETE', existingMeasurementId: 'measurement-a' }],
      conflicts: [],
    });
  });

  it('não escolhe automaticamente quando duas fotos divergem no mesmo turno', () => {
    const plan = planMilkSessionMerge(existing, [
      {
        animalId: 'animal-a',
        status: 'CONFIRMED',
        morningLiters: 11,
        afternoonLiters: null,
        mergeDecision: null,
      },
    ]);

    expect(plan).toEqual({
      actions: [],
      conflicts: [{ incomingIndex: 0, existingMeasurementId: 'measurement-a' }],
    });
  });

  it('preserva uma transcrição excluída sem tratá-la como duplicata ativa', () => {
    const plan = planMilkSessionMerge(existing, [
      { animalId: 'animal-a', status: 'EXCLUDED', mergeDecision: null },
    ]);

    expect(plan).toEqual({
      actions: [{ incomingIndex: 0, kind: 'ADD' }],
      conflicts: [],
    });
  });
});
