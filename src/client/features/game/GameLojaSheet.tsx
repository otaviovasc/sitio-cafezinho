import { useMemo, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { parseDecimal } from '../../../domain/format';
import { feedUnitSuffix } from '../../../domain/feeding';
import { formatFeedQuantity, type FeedInventoryRow, type FeedItemRow } from '../feeding/types';
import { DecimalInput, MoneyInput } from '../../components/form-controls';
import { Button, ErrorState } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { api, ApiError, json } from '../../lib/api';
import { today } from '../../lib/labels';
import { GameSheet } from './GameSheet';
import { LOJA_CATEGORIES, LOJA_ITEMS, type LojaCategoryId, type LojaItem } from './loja-catalog';
import { LojaSprite } from './sprites/LojaSprite';

/**
 * A Loja do sítio: vitrine por categoria com itens populares e preço sugerido
 * como PLACEHOLDER editável. Comprar grava a compra REAL (/api/purchases) e,
 * para insumos estocáveis, credita o Depósito (feed_items +
 * feed_purchase_entries) — regra de ouro: nada de moeda fictícia.
 */
export function GameLojaSheet({ open, onClose, onPurchased }: {
  open: boolean;
  onClose: () => void;
  onPurchased: (item: LojaItem) => void;
}) {
  const { busy, error, run, setError } = useSubmit();
  const inventoryResource = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const [category, setCategory] = useState<LojaCategoryId>('sementes');
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  /** Quantos pacotes (sacos, frascos…) estão sendo comprados. */
  const [packs, setPacks] = useState('1');
  /** Tamanho do pacote na unidade canônica (o "saco de X kg", editável). */
  const [packSize, setPackSize] = useState('');
  /** Preço POR PACOTE (sugerido, editável). */
  const [unitPrice, setUnitPrice] = useState('');
  const [paid, setPaid] = useState(true);
  const [formError, setFormError] = useState('');

  const inventory = useMemo(() => inventoryResource.data ?? [], [inventoryResource.data]);
  const items = LOJA_ITEMS.filter((item) => item.category === category);

  function stockRow(item: LojaItem): FeedInventoryRow | null {
    return inventory.find((row) => row.name.toLowerCase() === item.name.toLowerCase()) ?? null;
  }

  function openItem(item: LojaItem) {
    setOpenItemId(item.id);
    setPacks('1');
    setPackSize(item.defaultQuantity ? String(item.defaultQuantity) : '');
    setUnitPrice(item.suggestedPrice.toFixed(2).replace('.', ','));
    setPaid(true);
    setFormError('');
    setError('');
  }

  const parsedPacks = parseDecimal(packs);
  const parsedPackSize = parseDecimal(packSize);
  const parsedUnitPrice = parseDecimal(unitPrice);
  /** Total em R$ = pacotes × preço do pacote. */
  const totalPrice = parsedPacks !== null && parsedUnitPrice !== null ? Math.round(parsedPacks * parsedUnitPrice * 100) / 100 : null;
  /** Total creditado no depósito = pacotes × tamanho do pacote. */
  const totalQuantity = parsedPacks !== null && parsedPackSize !== null ? Math.round(parsedPacks * parsedPackSize * 1000) / 1000 : null;

  /** Garante o item no catálogo do Depósito e devolve o id (cria se faltar). */
  async function ensureFeedItem(item: LojaItem): Promise<string> {
    const existing = stockRow(item);
    if (existing) return existing.feedItemId;
    try {
      const created = await api<FeedItemRow>('/api/feed-items', json('POST', { name: item.name, canonicalUnit: item.canonicalUnit }));
      return created.id;
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'DUPLICATE_FEED_ITEM') {
        const all = await api<FeedItemRow[]>('/api/feed-items');
        const match = all.find((row) => row.name.toLowerCase() === item.name.toLowerCase());
        if (match) return match.id;
      }
      throw cause;
    }
  }

  async function buy(item: LojaItem) {
    if (parsedPacks === null || parsedPacks <= 0) { setFormError(`Informe quantos ${item.packNoun}s está comprando.`); return; }
    if (parsedUnitPrice === null || parsedUnitPrice <= 0 || totalPrice === null) { setFormError(`Informe o preço por ${item.packNoun}.`); return; }
    if (item.stockable && (parsedPackSize === null || parsedPackSize <= 0 || totalQuantity === null)) {
      setFormError(`Informe o tamanho do ${item.packNoun} (${item.canonicalUnit ? feedUnitSuffix[item.canonicalUnit] : 'un'}).`);
      return;
    }
    setFormError('');
    const packsLabel = parsedPacks === 1 ? item.packNoun : `${parsedPacks}× ${item.packNoun}`;
    const sizeLabel = item.stockable && item.canonicalUnit ? ` de ${parsedPackSize} ${feedUnitSuffix[item.canonicalUnit]}` : '';
    await run(async () => {
      const purchase = await api<{ id: string }>('/api/purchases', json('POST', {
        purchaseDate: today(),
        description: `Loja do sítio: ${item.name} (${packsLabel}${sizeLabel})`,
        category: item.purchaseCategory,
        totalAmount: totalPrice,
        status: paid ? 'PAID' : 'OPEN',
      }));
      // Linha de item da compra (/compras → Itens): 3 × saco de 20 kg a R$ 420.
      await api(`/api/purchases/${purchase.id}/items`, json('POST', {
        description: `${item.name} — ${item.packNoun}${sizeLabel}`,
        quantity: parsedPacks,
        unit: item.purchaseUnit,
        unitPrice: parsedUnitPrice,
        totalPrice,
      }));
      if (item.stockable) {
        const feedItemId = await ensureFeedItem(item);
        await api('/api/feed-purchase-entries', json('POST', { feedItemId, purchaseId: purchase.id, quantity: totalQuantity }));
      }
      setOpenItemId(null);
      void inventoryResource.reload(false);
      onPurchased(item);
    });
  }

  return <GameSheet open={open} label="Loja do sítio" testid="game-loja-sheet" title="Loja do sítio" subtitle="Compras reais: o gasto entra na economia; insumos vão para o Depósito." onClose={onClose} sprite={<LojaSprite x={32} y={32} size={64} />}>
    <div className="game-sheet-body grid gap-3">
      {error && <ErrorState message={error} />}
      <div className="game-loja-cats" role="tablist" aria-label="Categorias da loja">
        {LOJA_CATEGORIES.map((entry) => <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={category === entry.id}
          className="game-loja-cat"
          data-active={category === entry.id}
          onClick={() => { setCategory(entry.id); setOpenItemId(null); }}
        >{entry.emoji} {entry.label}</button>)}
      </div>
      <div className="grid gap-2" data-testid="loja-items">
        {items.map((item) => {
          const stock = stockRow(item);
          const opened = openItemId === item.id;
          return <div key={item.id} className="game-loja-card" data-open={opened} data-testid={`loja-item-${item.id}`}>
            <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => (opened ? setOpenItemId(null) : openItem(item))}>
              <span className="game-loja-emoji" aria-hidden>{item.emoji}</span>
              <span className="min-w-0 flex-1">
                <strong className="block">{item.name}</strong>
                <small className="block text-xs text-[#6b6e60]">
                  {item.packLabel}
                  {item.stockable && stock && <> · no depósito: {formatFeedQuantity(stock.balance, stock.canonicalUnit)}</>}
                  {!item.stockable && <> · só financeiro (não estoca)</>}
                </small>
              </span>
              <span className="game-loja-price">R$ {item.suggestedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </button>
            {opened && <div className="mt-3 grid gap-3 border-t border-[rgb(58_61_53_/_12%)] pt-3">
              {formError && <p className="text-sm font-bold text-[var(--danger,#b3261e)]" role="alert">{formError}</p>}
              <div className={`grid gap-3 ${item.stockable ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <label className="grid gap-1 text-xs font-bold text-[#6b6e60]">
                  Quantidade
                  <DecimalInput aria-label={`Quantidade de ${item.packNoun}s de ${item.name}`} value={packs} maximumFractionDigits={2} suffix={item.packNoun} onValueChange={setPacks} />
                </label>
                {item.stockable && <label className="grid gap-1 text-xs font-bold text-[#6b6e60]">
                  Tamanho do {item.packNoun}
                  <DecimalInput aria-label={`Tamanho do ${item.packNoun} de ${item.name}`} value={packSize} maximumFractionDigits={3} suffix={item.canonicalUnit ? feedUnitSuffix[item.canonicalUnit] : undefined} onValueChange={setPackSize} />
                </label>}
                <label className="grid gap-1 text-xs font-bold text-[#6b6e60]">
                  Preço por {item.packNoun}
                  <MoneyInput aria-label={`Preço por ${item.packNoun} de ${item.name}`} value={unitPrice} onValueChange={setUnitPrice} />
                </label>
              </div>
              <p className="text-sm font-semibold" data-testid={`loja-summary-${item.id}`}>
                {totalPrice !== null ? <>Total: <strong className="tabular-nums">R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></> : 'Preencha quantidade e preço.'}
                {item.stockable && totalQuantity !== null && item.canonicalUnit && <> · entra no depósito: <strong className="tabular-nums">{formatFeedQuantity(totalQuantity, item.canonicalUnit)}</strong></>}
              </p>
              <label className="inline-flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} /> Já está pago
              </label>
              <Button disabled={busy} data-testid={`loja-buy-${item.id}`} onClick={() => void buy(item)}>
                <ShoppingBag size={16} aria-hidden /> {busy ? 'Comprando…' : 'Comprar'}
              </Button>
            </div>}
          </div>;
        })}
      </div>
      <p className="text-xs leading-4 text-[#6b6e60]">💡 Preços e quantidades são sugestões — ajuste para o valor real da sua compra. Itens estocáveis creditam o Depósito e podem ser usados no trato e no plantio.</p>
    </div>
  </GameSheet>;
}
