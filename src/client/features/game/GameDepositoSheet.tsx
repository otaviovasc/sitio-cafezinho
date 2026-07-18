import { useState } from 'react';
import { ArrowLeft, PackagePlus, ShoppingCart } from 'lucide-react';
import { formatFeedQuantity, type FeedInventoryRow } from '../feeding/types';
import { FeedItemForm } from '../feeding/FeedItemForm';
import { FeedPurchaseForm } from '../feeding/FeedPurchaseForm';
import { useResource } from '../../hooks/useResource';
import { useToast } from '../../components/feedback-context';
import { GameSheet } from './GameSheet';
import { DepositoSprite } from './sprites/DepositoSprite';

type SheetView = 'inventory' | 'purchase' | 'newItem';

/**
 * Folha do Depósito: o inventário de alimentação com cara de jogo. Lista o
 * saldo DERIVADO por item (comprado − consumido, nunca armazenado) e oferece
 * as duas portas de entrada do estoque: compra real vinculada e item novo do
 * catálogo.
 */
export function GameDepositoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data: inventory, reload } = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const [view, setView] = useState<SheetView>('inventory');

  if (!open) return null;
  const rows = (inventory ?? []).filter((row) => row.active);

  return <GameSheet open={open} label="Depósito" testid="game-deposito-sheet" title="Depósito" subtitle="Estoque de alimentação: entra por compra, sai por trato." onClose={onClose} sprite={<DepositoSprite x={32} y={32} size={64} />}>
    {view === 'inventory' && <div className="game-sheet-body grid gap-2">
      {/* Convenção das folhas: AÇÕES sempre acima, listagem depois. */}
      <button type="button" className="game-sheet-action" onClick={() => setView('purchase')}>
        <ShoppingCart size={22} aria-hidden />
        <span><strong>Registrar compra de alimento</strong><small>Cria a compra real (ou vincula uma existente) e credita o estoque.</small></span>
      </button>
      <button type="button" className="game-sheet-action" onClick={() => setView('newItem')}>
        <PackagePlus size={22} aria-hidden />
        <span><strong>Novo item do catálogo</strong><small>Nome e unidade de controle (kg, litros ou unidades).</small></span>
      </button>
      <div className="mt-1 grid gap-1.5" data-testid="feed-inventory-list">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#6b6e60' }}>Estoque atual</p>
        {!rows.length && <p className="text-sm" style={{ color: '#6b6e60' }}>Nenhum item no catálogo ainda. Cadastre um item e registre a primeira compra.</p>}
        {rows.map((row) => <div key={row.feedItemId} className="game-sheet-action" data-testid={`feed-inventory-item-${row.feedItemId}`}>
          <span className="min-w-0 flex-1"><strong>{row.name}</strong><small>Comprado {formatFeedQuantity(row.purchasedQuantity, row.canonicalUnit)} · usado {formatFeedQuantity(row.consumedQuantity, row.canonicalUnit)}</small></span>
          <strong data-testid={`feed-inventory-balance-${row.feedItemId}`}>{formatFeedQuantity(row.balance, row.canonicalUnit)}</strong>
        </div>)}
      </div>
    </div>}

    {view !== 'inventory' && <div className="game-sheet-body">
      <button type="button" className="game-sheet-back" onClick={() => setView('inventory')}><ArrowLeft size={16} aria-hidden />Voltar ao estoque</button>
      {view === 'purchase' && <FeedPurchaseForm onSaved={() => { toast('Compra de alimento registrada'); void reload(false); setView('inventory'); }} />}
      {view === 'newItem' && <FeedItemForm onSaved={(item) => { toast(`Item “${item.name}” criado`); void reload(false); setView('inventory'); }} />}
    </div>}
  </GameSheet>;
}
