import { describe, expect, it } from 'vitest';
import { individualProductionLabel, individualProductionParts, type IndividualProductionSummary } from '../../src/client/features/animals/individual-production';

const production = (overrides: Partial<IndividualProductionSummary> = {}): IndividualProductionSummary => ({
  id: 'measurement-1',
  sessionDate: '2026-07-28',
  herdGroupId: 'group-1',
  herdGroupName: 'Lote 1',
  morningLiters: null,
  afternoonLiters: null,
  totalLiters: null,
  ...overrides,
});

describe('resumo dos últimos controles individuais', () => {
  it('mostra somente os turnos realmente medidos', () => {
    expect(individualProductionParts(production({ morningLiters: '10.00', totalLiters: '10.00' })))
      .toBe('Manhã 10 L');
    expect(individualProductionParts(production({ afternoonLiters: '12.50', totalLiters: '12.50' })))
      .toBe('Tarde 12,5 L');
  });

  it('mostra manhã e tarde sem substituir as partes pelo total', () => {
    expect(individualProductionLabel(production({
      morningLiters: '10.00',
      afternoonLiters: '12.50',
      totalLiters: '22.50',
    }))).toBe('28/07/2026 · Manhã 10 L · Tarde 12,5 L');
  });

  it('mantém controles antigos que possuem somente o total medido', () => {
    expect(individualProductionParts(production({ totalLiters: '9.50' }))).toBe('9,5 L');
  });
});
