import { describe, expect, it } from 'vitest';
import { interpretationSchema, type FeedingEventIntent, type FeedPurchaseIntent } from '../../src/domain/nl/intents';
import {
  matchFeedItemByLabel,
  resolveFeedingEvent,
  resolveFeedPurchase,
  resolveFeedQuantity,
  type ResolveContext,
} from '../../src/domain/nl/resolve';

const NOW = new Date('2026-07-15T09:00:00-03:00');

const ctx: ResolveContext = {
  groups: [
    { id: 'g1', name: 'Lote 1', milkingRoutine: 'MORNING_AND_AFTERNOON', active: true },
    { id: 'g2', name: 'Lote 2', milkingRoutine: 'MORNING_ONLY', active: true },
  ],
  animals: [],
  aliases: [],
  suppliers: [],
  feedItems: [
    { id: 'silagem', name: 'Silagem', canonicalUnit: 'KG', active: true },
    { id: 'mineral', name: 'Mineral em pó', canonicalUnit: 'KG', active: true },
    { id: 'soro', name: 'Soro', canonicalUnit: 'LITER', active: true },
    { id: 'inativo', name: 'Item inativo', canonicalUnit: 'KG', active: false },
  ],
};

const spokenToday = { relative: 'hoje' as const, iso: null, rawText: 'hoje' };

function feedPurchase(overrides: Partial<FeedPurchaseIntent> = {}): FeedPurchaseIntent {
  return {
    type: 'feed_purchase',
    date: spokenToday,
    itemLabel: 'silagem',
    quantity: 3,
    unitLabel: 'toneladas',
    amount: 3200,
    supplierLabel: null,
    paid: false,
    rawValueText: null,
    confidence: 'HIGH',
    notes: null,
    ...overrides,
  };
}

function feedingEvent(overrides: Partial<FeedingEventIntent> = {}): FeedingEventIntent {
  return {
    type: 'feeding_event',
    date: spokenToday,
    contextLabel: 'na ordenha',
    scopeLabel: 'lote 1',
    lines: [
      { itemLabel: 'silagem', quantity: 3, unitLabel: 'toneladas', rawValueText: '3 toneladas de silagem' },
      { itemLabel: 'mineral em pó', quantity: 2, unitLabel: 'quilos', rawValueText: '2 quilos de mineral' },
    ],
    confidence: 'HIGH',
    notes: null,
    ...overrides,
  };
}

describe('NL de alimentação — casamento e conversão determinísticos', () => {
  it('casa item por nome normalizado exato, nunca por aproximação; inativo não casa', () => {
    expect(matchFeedItemByLabel('SILAGEM', ctx.feedItems)?.id).toBe('silagem');
    expect(matchFeedItemByLabel('mineral em po', ctx.feedItems)?.id).toBe('mineral');
    expect(matchFeedItemByLabel('silagem de milho', ctx.feedItems)).toBeUndefined();
    expect(matchFeedItemByLabel('item inativo', ctx.feedItems)).toBeUndefined();
  });

  it('converte unidades faladas: t→kg ×1000; sacos não têm conversão; sem unidade pede conferência', () => {
    expect(resolveFeedQuantity(3, 'toneladas', 'KG')).toEqual({ quantity: 3000, issue: null });
    expect(resolveFeedQuantity(1.5, 't', 'KG')).toEqual({ quantity: 1500, issue: null });
    expect(resolveFeedQuantity(500, 'kg', 'KG')).toEqual({ quantity: 500, issue: null });
    expect(resolveFeedQuantity(20, 'litros', 'LITER')).toEqual({ quantity: 20, issue: null });
    const sacks = resolveFeedQuantity(40, 'sacos', 'KG');
    expect(sacks.quantity).toBeNull();
    expect(sacks.issue).toMatch(/sacos/);
    const noUnit = resolveFeedQuantity(100, null, 'KG');
    expect(noUnit.quantity).toBe(100);
    expect(noUnit.issue).toMatch(/Unidade não informada/);
    // Tonelada para item em litros também não tem conversão automática.
    expect(resolveFeedQuantity(2, 'toneladas', 'LITER').quantity).toBeNull();
  });
});

describe('NL de alimentação — compra de alimento', () => {
  it('"3 toneladas de silagem por 3.200" → READY com quantidade canônica 3000 kg', () => {
    const resolved = resolveFeedPurchase(feedPurchase(), ctx, NOW);
    expect(resolved.actionType).toBe('FEED_PURCHASE');
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload).toMatchObject({
      purchaseDate: '2026-07-15',
      category: 'FEED',
      feedItemId: 'silagem',
      quantity: 3000,
      totalAmount: 3200,
      status: 'OPEN',
    });
  });

  it('"40 sacos de ração" → NEEDS_REVIEW (unidade sem conversão) e item desconhecido nunca vira cadastro', () => {
    const resolved = resolveFeedPurchase(feedPurchase({ itemLabel: 'ração', quantity: 40, unitLabel: 'sacos' }), ctx, NOW);
    expect(resolved.commitStatus).toBe('NEEDS_REVIEW');
    expect(resolved.resolvedPayload.feedItemId).toBeNull();
    expect(resolved.issues.join(' ')).toMatch(/não está no catálogo/);
  });

  it('sem valor dito → NEEDS_REVIEW pedindo o valor', () => {
    const resolved = resolveFeedPurchase(feedPurchase({ amount: null }), ctx, NOW);
    expect(resolved.commitStatus).toBe('NEEDS_REVIEW');
    expect(resolved.issues.join(' ')).toMatch(/valor da compra/);
  });
});

describe('NL de alimentação — trato (feeding_event)', () => {
  it('múltiplas linhas num áudio: 3 t silagem + 2 kg mineral pro lote 1 na ordenha → READY MILKING', () => {
    const resolved = resolveFeedingEvent(feedingEvent(), ctx, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload).toMatchObject({ date: '2026-07-15', context: 'MILKING', herdGroupId: 'g1' });
    const items = resolved.resolvedPayload.items as Array<{ feedItemId: string; quantity: number }>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ feedItemId: 'silagem', quantity: 3000 });
    expect(items[1]).toMatchObject({ feedItemId: 'mineral', quantity: 2 });
  });

  it('"gastei 500 kg de silagem na estação" → STATION sem lote, READY', () => {
    const resolved = resolveFeedingEvent(feedingEvent({
      contextLabel: 'na estação',
      scopeLabel: null,
      lines: [{ itemLabel: 'silagem', quantity: 500, unitLabel: 'kg', rawValueText: '500 kg de silagem' }],
    }), ctx, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload).toMatchObject({ context: 'STATION', herdGroupId: null });
  });

  it('lote inexistente → NEEDS_REVIEW com a pendência do lote', () => {
    const resolved = resolveFeedingEvent(feedingEvent({ scopeLabel: 'lote 9' }), ctx, NOW);
    expect(resolved.commitStatus).toBe('NEEDS_REVIEW');
    expect(resolved.issues.join(' ')).toMatch(/Lote “lote 9” não encontrado/);
  });

  it('ordenha sem lote dito → NEEDS_REVIEW; contexto não dito também', () => {
    const semLote = resolveFeedingEvent(feedingEvent({ scopeLabel: null }), ctx, NOW);
    expect(semLote.commitStatus).toBe('NEEDS_REVIEW');
    expect(semLote.issues.join(' ')).toMatch(/precisa do lote/);

    const semContexto = resolveFeedingEvent(feedingEvent({ contextLabel: null, scopeLabel: null }), ctx, NOW);
    expect(semContexto.commitStatus).toBe('NEEDS_REVIEW');
    expect(semContexto.resolvedPayload.context).toBeNull();
  });

  it('item desconhecido numa das linhas → NEEDS_REVIEW sem derrubar as outras', () => {
    const resolved = resolveFeedingEvent(feedingEvent({
      lines: [
        { itemLabel: 'silagem', quantity: 100, unitLabel: 'kg', rawValueText: null },
        { itemLabel: 'polpa cítrica', quantity: 50, unitLabel: 'kg', rawValueText: null },
      ],
    }), ctx, NOW);
    expect(resolved.commitStatus).toBe('NEEDS_REVIEW');
    const items = resolved.resolvedPayload.items as Array<{ feedItemId: string | null }>;
    expect(items[0].feedItemId).toBe('silagem');
    expect(items[1].feedItemId).toBeNull();
  });
});

describe('NL de alimentação — schema de intents', () => {
  it('aceita os novos tipos vindos do modelo (JSON fixo)', () => {
    const parsed = interpretationSchema.parse({
      intents: [
        { type: 'feed_purchase', date: { relative: null, iso: null, rawText: '' }, itemLabel: 'ração', quantity: 40, unitLabel: 'sacos', amount: 3200, supplierLabel: null, paid: false, rawValueText: '40 sacos', confidence: 'HIGH', notes: null },
        { type: 'feeding_event', date: { relative: 'hoje', iso: null, rawText: 'hoje' }, contextLabel: 'na estação', scopeLabel: null, lines: [{ itemLabel: 'silagem', quantity: 500, unitLabel: 'kg', rawValueText: null }], confidence: 'HIGH', notes: null },
      ],
    });
    expect(parsed.intents).toHaveLength(2);
  });
});
