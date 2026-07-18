import { describe, expect, it } from 'vitest';
import { computeStreak } from '../../src/domain/game/streaks';

describe('computeStreak', () => {
  const today = '2026-07-17';

  it('vazio → zero', () => {
    expect(computeStreak([], today)).toEqual({ current: 0, best: 0 });
  });

  it('registrado hoje incrementa a sequência', () => {
    expect(computeStreak(['2026-07-15', '2026-07-16', '2026-07-17'], today)).toEqual({ current: 3, best: 3 });
  });

  it('registro só até ontem mantém a sequência (o dia pode não ter acabado)', () => {
    expect(computeStreak(['2026-07-14', '2026-07-15', '2026-07-16'], today)).toEqual({ current: 3, best: 3 });
  });

  it('registro parado anteontem zera a atual mas preserva a melhor', () => {
    expect(computeStreak(['2026-07-13', '2026-07-14', '2026-07-15'], today)).toEqual({ current: 0, best: 3 });
  });

  it('quebra no meio reinicia a contagem', () => {
    const result = computeStreak(['2026-07-10', '2026-07-11', '2026-07-14', '2026-07-16', '2026-07-17'], today);
    expect(result.current).toBe(2);
    expect(result.best).toBe(2);
  });

  it('datas duplicadas (total geral + por lote no mesmo dia) contam uma vez', () => {
    expect(computeStreak(['2026-07-16', '2026-07-16', '2026-07-17', '2026-07-17'], today)).toEqual({ current: 2, best: 2 });
  });

  it('datas futuras são ignoradas', () => {
    expect(computeStreak(['2026-07-17', '2026-07-18'], today)).toEqual({ current: 1, best: 1 });
  });

  it('vira o mês corretamente', () => {
    expect(computeStreak(['2026-06-30', '2026-07-01'], '2026-07-01')).toEqual({ current: 2, best: 2 });
  });
});
