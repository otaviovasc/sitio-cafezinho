import { describe, expect, it } from 'vitest';
import { computeFeedInventory, feedLinesError, linesBeyondBalance, tonsToKg } from '../../src/domain/feeding';

describe('inventário de alimentação (saldo derivado)', () => {
  it('deriva o saldo por item: comprado − consumido, nunca armazenado', () => {
    const inventory = computeFeedInventory(
      [
        { feedItemId: 'silagem', quantity: '3000' },
        { feedItemId: 'silagem', quantity: 500 },
        { feedItemId: 'mineral', quantity: '40.5' },
      ],
      [
        { feedItemId: 'silagem', quantity: '1200.25' },
        { feedItemId: 'racao', quantity: 10 },
      ],
    );
    const byItem = new Map(inventory.map((line) => [line.feedItemId, line]));
    expect(byItem.get('silagem')).toEqual({ feedItemId: 'silagem', purchasedQuantity: 3500, consumedQuantity: 1200.25, balance: 2299.75 });
    expect(byItem.get('mineral')).toEqual({ feedItemId: 'mineral', purchasedQuantity: 40.5, consumedQuantity: 0, balance: 40.5 });
    // Consumo sem compra registrada fica NEGATIVO — o histórico incompleto é
    // visível, nunca escondido (anti-inferência: não inventamos uma compra).
    expect(byItem.get('racao')).toEqual({ feedItemId: 'racao', purchasedQuantity: 0, consumedQuantity: 10, balance: -10 });
  });

  it('converte toneladas para kg no formulário (×1000), com 3 casas estáveis', () => {
    expect(tonsToKg(3)).toBe(3000);
    expect(tonsToKg(0.5)).toBe(500);
    expect(tonsToKg(1.2345)).toBe(1234.5);
    expect(tonsToKg(0.0001)).toBe(0.1);
  });

  it('valida linhas: vazio, item ausente, quantidade inválida e item repetido', () => {
    expect(feedLinesError([])).toMatch(/pelo menos um item/);
    expect(feedLinesError([{ feedItemId: '', quantity: 10 }])).toMatch(/Selecione o item/);
    expect(feedLinesError([{ feedItemId: 'a', quantity: null }])).toMatch(/maior que zero/);
    expect(feedLinesError([{ feedItemId: 'a', quantity: 0 }])).toMatch(/maior que zero/);
    expect(feedLinesError([{ feedItemId: 'a', quantity: -2 }])).toMatch(/maior que zero/);
    expect(feedLinesError([
      { feedItemId: 'a', quantity: 1 },
      { feedItemId: 'a', quantity: 2 },
    ])).toMatch(/mais de uma linha/);
    expect(feedLinesError([
      { feedItemId: 'a', quantity: 1 },
      { feedItemId: 'b', quantity: 2 },
    ])).toBeNull();
  });

  it('aponta as linhas que passam do saldo (aviso, não bloqueio)', () => {
    const inventory = computeFeedInventory(
      [{ feedItemId: 'silagem', quantity: 1000 }],
      [{ feedItemId: 'silagem', quantity: 400 }],
    );
    expect(linesBeyondBalance([{ feedItemId: 'silagem', quantity: 500 }], inventory)).toEqual([]);
    expect(linesBeyondBalance([{ feedItemId: 'silagem', quantity: 700 }], inventory)).toEqual([
      { feedItemId: 'silagem', quantity: 700, balance: 600 },
    ]);
    // Item sem qualquer compra: saldo 0 → qualquer uso é "além do saldo".
    expect(linesBeyondBalance([{ feedItemId: 'novo', quantity: 1 }], inventory)).toEqual([
      { feedItemId: 'novo', quantity: 1, balance: 0 },
    ]);
  });
});
