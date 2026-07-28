import { useEffect, useState } from 'react';
import { ArrowLeft, PackagePlus, ShoppingCart } from 'lucide-react';
import { formatFeedQuantity, type FeedInventoryRow } from '../feeding/types';
import { CatalogItemEditor } from '../feeding/CatalogItemEditor';
import { FeedItemForm } from '../feeding/FeedItemForm';
import { FeedPurchaseForm } from '../feeding/FeedPurchaseForm';
import { FeedPurchaseReviewForm } from '../feeding/FeedPurchaseReviewForm';
import { useResource } from '../../hooks/useResource';
import { useToast } from '../../components/feedback-context';
import { StatusBadge } from '../../components/ui';
import { GameEntitySheet, type GameEntityAction } from './GameEntitySheet';
import { GameReviewNotice } from './GameReviewNotice';
import { type SheetReview } from './review';
import { DepositoSprite } from './sprites/DepositoSprite';

type SheetView = 'inventory' | 'purchase' | 'newItem' | 'item' | 'review';

/**
 * Folha do Depósito: o inventário de alimentação com cara de jogo. Lista o
 * saldo DERIVADO por item (comprado − consumido, nunca armazenado) e oferece
 * as portas de entrada do estoque: compra real vinculada e item novo do
 * catálogo. Tocar num item abre o editor real do catálogo (renomear,
 * reativar/desativar; unidade travada após a primeira movimentação).
 * Em modo revisão, a compra de alimento falada/fotografada abre preenchida e
 * confirma pela pipeline de revisão.
 */
export function GameDepositoSheet({ open, review, onClose, onOpenLoja }: {
  open: boolean;
  review?: SheetReview;
  onClose: () => void;
  onOpenLoja: () => void;
}) {
  const toast = useToast();
  const { data: inventory, reload } = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const [view, setView] = useState<SheetView>('inventory');
  const [selected, setSelected] = useState<FeedInventoryRow | null>(null);

  useEffect(() => {
    if (open) setView(review ? 'review' : 'inventory');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const rows = inventory ?? [];
  // O item selecionado é relido do inventário recarregado (saldo sempre derivado).
  const selectedRow = selected ? rows.find((row) => row.feedItemId === selected.feedItemId) ?? selected : null;

  function handleItemChanged() {
    void reload(false);
  }

  // Convenção das folhas: AÇÕES sempre acima, listagem depois (scaffold).
  const actions: GameEntityAction[] = [
    { icon: <ShoppingCart size={22} aria-hidden />, label: 'Comprar na Loja', hint: 'Sementes, adubo, ração… A compra real credita o estoque.', onClick: onOpenLoja, testid: 'deposito-open-loja' },
    { icon: <PackagePlus size={22} aria-hidden />, label: 'Vincular compra já registrada', hint: 'Credita o estoque a partir de uma compra existente (ou avulsa).', onClick: () => setView('purchase') },
    { icon: <PackagePlus size={22} aria-hidden />, label: 'Novo item do catálogo', hint: 'Nome e unidade de controle (kg, litros ou unidades).', onClick: () => setView('newItem') },
  ];

  return <GameEntitySheet open={open} label="Depósito" testid="game-deposito-sheet" title="Depósito" subtitle={review ? 'Revise a compra de alimento que o assistente entendeu.' : 'O estoque entra pela Loja e sai nos tratos e plantios.'} onClose={onClose} sprite={<DepositoSprite x={32} y={32} size={64} />} actions={view === 'inventory' ? actions : undefined}>
    {view === 'review' && review && <>
      <GameReviewNotice action={review.action} onDone={review.onDone} />
      <FeedPurchaseReviewForm action={review.action} onCommitted={() => review.onDone('committed')} />
    </>}

    {view === 'inventory' && <div className="grid gap-1.5" data-testid="feed-inventory-list">
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b6e60' }}>Estoque atual</p>
      {!rows.length && <p className="text-sm" style={{ color: '#6b6e60' }}>Estoque vazio. Compre na Loja para encher o depósito — o trato e o plantio consomem daqui.</p>}
      {rows.map((row) => <button key={row.feedItemId} type="button" className="game-sheet-action" data-testid={`feed-inventory-item-${row.feedItemId}`} onClick={() => { setSelected(row); setView('item'); }}>
        <span className="min-w-0 flex-1 text-left"><strong>{row.name}</strong><small>Comprado {formatFeedQuantity(row.purchasedQuantity, row.canonicalUnit)} · usado {formatFeedQuantity(row.consumedQuantity, row.canonicalUnit)}</small></span>
        {!row.active && <StatusBadge descriptor={{ label: 'Inativo', tone: 'neutral' }} />}
        <strong data-testid={`feed-inventory-balance-${row.feedItemId}`}>{formatFeedQuantity(row.balance, row.canonicalUnit)}</strong>
      </button>)}
    </div>}

    {view === 'item' && selectedRow && <>
      <button type="button" className="game-sheet-back" onClick={() => { setView('inventory'); setSelected(null); }}><ArrowLeft size={16} aria-hidden />Voltar ao estoque</button>
      <CatalogItemEditor row={selectedRow} onChanged={handleItemChanged} />
    </>}

    {(view === 'purchase' || view === 'newItem') && <>
      <button type="button" className="game-sheet-back" onClick={() => setView('inventory')}><ArrowLeft size={16} aria-hidden />Voltar ao estoque</button>
      {view === 'purchase' && <FeedPurchaseForm onSaved={() => { toast('Compra de alimento registrada'); void reload(false); setView('inventory'); }} />}
      {view === 'newItem' && <FeedItemForm onSaved={(item) => { toast(`Item “${item.name}” criado`); void reload(false); setView('inventory'); }} />}
    </>}
  </GameEntitySheet>;
}
