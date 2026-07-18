import { describe, expect, it } from 'vitest';
import { formatRemaining, growthProgress, growthStage, plantingReadyAt } from '../../src/domain/game/planting';

const plantedAt = '2026-07-18T12:00:00.000Z';

describe('growthProgress', () => {
  it('começa em zero no momento do plantio', () => {
    expect(growthProgress(plantedAt, 10, new Date(plantedAt))).toBe(0);
  });
  it('avança linearmente com o relógio', () => {
    expect(growthProgress(plantedAt, 10, new Date('2026-07-18T17:00:00.000Z'))).toBeCloseTo(0.5);
  });
  it('clampa em 1 depois do fim do ciclo', () => {
    expect(growthProgress(plantedAt, 10, new Date('2026-07-20T12:00:00.000Z'))).toBe(1);
  });
  it('plantio no futuro (relógio torto) clampa em zero', () => {
    expect(growthProgress(plantedAt, 10, new Date('2026-07-18T11:00:00.000Z'))).toBe(0);
  });
  it('duração inválida degrada para pronto (nunca trava a colheita)', () => {
    expect(growthProgress(plantedAt, 0, new Date(plantedAt))).toBe(1);
    expect(growthProgress('data-invalida', 10, new Date(plantedAt))).toBe(1);
  });
});

describe('growthStage', () => {
  it('mapeia os limiares do ciclo', () => {
    expect(growthStage(0)).toBe('SPROUT');
    expect(growthStage(0.24)).toBe('SPROUT');
    expect(growthStage(0.25)).toBe('GROWING');
    expect(growthStage(0.59)).toBe('GROWING');
    expect(growthStage(0.6)).toBe('MATURE');
    expect(growthStage(0.99)).toBe('MATURE');
    expect(growthStage(1)).toBe('READY');
  });
});

describe('plantingReadyAt', () => {
  it('soma a duração ao plantio', () => {
    expect(plantingReadyAt(plantedAt, 48).toISOString()).toBe('2026-07-20T12:00:00.000Z');
  });
});

describe('formatRemaining', () => {
  it('minutos, horas e dias amigáveis', () => {
    expect(formatRemaining(12 * 60_000)).toBe('12 min');
    expect(formatRemaining(3.5 * 3_600_000)).toBe('3 h 30 min');
    expect(formatRemaining(26 * 3_600_000)).toBe('1 d 2 h');
    expect(formatRemaining(48 * 3_600_000)).toBe('2 d');
    expect(formatRemaining(-5000)).toBe('0 min');
  });
});
