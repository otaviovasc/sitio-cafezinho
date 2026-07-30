import { describe, expect, it } from 'vitest';
import { collectLatestProductionsByAnimal } from '../../src/server/services/animal-production-summary';

describe('últimas produções por animal', () => {
  it('mantém somente as duas primeiras medições da consulta ordenada', () => {
    const summaries = collectLatestProductionsByAnimal([
      { animalId: 'animal-1', date: '2026-07-28' },
      { animalId: 'animal-2', date: '2026-07-27' },
      { animalId: 'animal-1', date: '2026-07-26' },
      { animalId: 'animal-1', date: '2026-07-25' },
    ]);

    expect(summaries.get('animal-1')).toEqual([
      { animalId: 'animal-1', date: '2026-07-28' },
      { animalId: 'animal-1', date: '2026-07-26' },
    ]);
    expect(summaries.get('animal-2')).toEqual([
      { animalId: 'animal-2', date: '2026-07-27' },
    ]);
  });

  it('ignora medições ainda sem animal confirmado', () => {
    const summaries = collectLatestProductionsByAnimal([
      { animalId: null, date: '2026-07-28' },
    ]);

    expect(summaries.size).toBe(0);
  });
});
