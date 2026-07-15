import { describe, expect, it } from 'vitest';
import { confirmedSeed, excludedSeed, pendingSeed, seedConfirmedTotal } from '../../src/db/seed-data';

describe('controle de 06/05/2026', () => {
  it('possui 45 confirmados e totaliza 724,5 L', () => {
    expect(confirmedSeed).toHaveLength(45);
    expect(seedConfirmedTotal).toBe(724.5);
  });

  it('passa a 737,5 L quando 512 é confirmado', () => {
    expect(seedConfirmedTotal + pendingSeed.totalLiters).toBe(737.5);
  });

  it('mantém dez linhas riscadas separadas do total', () => {
    expect(excludedSeed).toHaveLength(10);
    expect(excludedSeed.some((row) => row.rawAnimalLabel === 'Granada')).toBe(true);
  });
});
