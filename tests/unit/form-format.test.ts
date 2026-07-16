import { describe, expect, it } from 'vitest';
import { formatDecimalInput, maskDecimalInput } from '../../src/client/lib/form-format';

describe('máscara decimal dos formulários', () => {
  it('aceita vírgula ou ponto sem perder o valor em digitação', () => {
    expect(maskDecimalInput('210.5')).toBe('210,5');
    expect(maskDecimalInput('210,')).toBe('210,');
    expect(maskDecimalInput('R$ 1.234,56')).toBe('1234,56');
  });

  it('limita casas decimais e normaliza ao sair do campo', () => {
    expect(maskDecimalInput('13,579')).toBe('13,57');
    expect(formatDecimalInput('13,5', 2)).toBe('13,50');
    expect(formatDecimalInput('', 2)).toBe('');
  });
});
