import { describe, expect, it } from 'vitest';
import { tankLevel } from '../../src/domain/game/tank';

describe('tankLevel', () => {
  it('sem produção registrada, tanque vazio (nunca inventa leite)', () => {
    expect(tankLevel(null, 0)).toBe(0);
    expect(tankLevel(null, 200)).toBe(0);
    expect(tankLevel(0, 0)).toBe(0);
  });
  it('produção sem coleta enche o tanque', () => {
    expect(tankLevel(400, 0)).toBe(1);
  });
  it('coleta parcial baixa o nível proporcionalmente', () => {
    expect(tankLevel(400, 100)).toBeCloseTo(0.75);
  });
  it('coleta maior que a produção clampa em zero', () => {
    expect(tankLevel(400, 500)).toBe(0);
  });
});
