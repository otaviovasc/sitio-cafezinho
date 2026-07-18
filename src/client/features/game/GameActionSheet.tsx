import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Droplets, Truck, Wheat } from 'lucide-react';
import type { GameState } from '../../../domain/game/state';
import { formatLiters } from '../../../domain/format';
import { DailyMilkTotalForm } from '../milk/DailyMilkTotalForm';
import { FeedingEventForm } from '../feeding/FeedingEventForm';
import { QuickCollectionForm } from './actions/QuickCollectionForm';
import { GameSheet } from './GameSheet';
import { MangueiraSprite } from './sprites/MangueiraSprite';

type SheetView = 'menu' | 'dailyTotal' | 'collection' | 'milkingFeed';
export type SheetResult = 'dailyTotal' | 'collection' | 'milkingFeed';

/**
 * Folha de ações da mangueira — ambientada no jogo (exigência do usuário):
 * desliza da borda, fundo "paper", Nunito, cartões de ação próprios. Nada de
 * Modal padrão (portal, focus trap e Esc vivem em GameSheet). Os formulários
 * dentro dela gravam fatos reais nos endpoints existentes (regra de ouro).
 */
export function GameActionSheet({ open, state, onClose, onRegistered }: {
  open: boolean;
  state: GameState;
  onClose: () => void;
  onRegistered: (result: SheetResult) => void;
}) {
  const [view, setView] = useState<SheetView>('menu');

  useEffect(() => {
    if (open) setView('menu');
  }, [open]);

  if (!open) return null;
  const { today } = state;
  const subtitle = today.producedLiters === null
    ? 'A produção de hoje ainda não foi registrada.'
    : `Hoje: ${formatLiters(today.producedLiters)} produzidos · ${today.collectionCount === 0 ? 'nenhuma coleta' : formatLiters(today.collectedLiters) + ' coletados'}.`;

  return <GameSheet open={open} label="Mangueira" testid="game-action-sheet" title="Mangueira" subtitle={subtitle} onClose={onClose} sprite={<MangueiraSprite x={32} y={32} size={64} />}>
    {view === 'menu' && <div className="game-sheet-body grid gap-2">
      <button type="button" className="game-sheet-action" onClick={() => setView('dailyTotal')}>
        <Droplets size={22} aria-hidden />
        <span><strong>Registrar produção do dia</strong><small>{today.hasDailyTotal ? 'Já tem registro hoje — dá para completar o outro período.' : 'Quantos litros saíram hoje.'}</small></span>
      </button>
      <button type="button" className="game-sheet-action" onClick={() => setView('collection')}>
        <Truck size={22} aria-hidden />
        <span><strong>Registrar coleta do laticínio</strong><small>O caminhão levou leite do tanque.</small></span>
      </button>
      <button type="button" className="game-sheet-action" onClick={() => setView('milkingFeed')}>
        <Wheat size={22} aria-hidden />
        <span><strong>Registrar trato da ordenha</strong><small>Ração dada ao lote durante a ordenha (baixa do estoque).</small></span>
      </button>
      <Link className="game-sheet-action" to="/producao/individual/novo">
        <ClipboardList size={22} aria-hidden />
        <span><strong>Controle individual</strong><small>Medir vaca por vaca (abre a folha completa).</small></span>
      </Link>
    </div>}

    {view !== 'menu' && <div className="game-sheet-body">
      <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar às ações</button>
      {view === 'dailyTotal' && <DailyMilkTotalForm onSaved={() => onRegistered('dailyTotal')} />}
      {view === 'collection' && <QuickCollectionForm onSaved={() => onRegistered('collection')} />}
      {view === 'milkingFeed' && <FeedingEventForm context="MILKING" onSaved={() => onRegistered('milkingFeed')} />}
    </div>}
  </GameSheet>;
}
