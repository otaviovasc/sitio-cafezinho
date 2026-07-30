import { useEffect, useState } from 'react';
import { ArrowLeft, ClipboardList, Droplets, Truck, Wheat } from 'lucide-react';
import type { GameState } from '../../../domain/game/state';
import { formatLiters } from '../../../domain/format';
import { DailyMilkTotalForm } from '../milk/DailyMilkTotalForm';
import { FeedingEventForm } from '../feeding/FeedingEventForm';
import { QuickCollectionForm } from './actions/QuickCollectionForm';
import { IndividualControlFlow } from './actions/IndividualControlFlow';
import { GameSheet } from './GameSheet';
import { GameReviewNotice } from './GameReviewNotice';
import { commitReviewAction, type SheetReview } from './review';
import { MangueiraSprite } from './sprites/MangueiraSprite';

type SheetView = 'menu' | 'dailyTotal' | 'collection' | 'milkingFeed' | 'individual';
export type SheetResult = 'dailyTotal' | 'collection' | 'milkingFeed' | 'individual';
/** Sub-views de registro que podem ser pedidas de fora (ex.: aba Produção do caderno). */
export type MangueiraView = 'dailyTotal' | 'collection' | 'individual';

/** Sub-view da folha no modo revisão, pelo tipo da ação proposta. */
function reviewView(actionType: string): SheetView {
  if (actionType === 'MILK_COLLECTION') return 'collection';
  if (actionType === 'FEEDING_EVENT') return 'milkingFeed';
  return 'dailyTotal';
}

/**
 * Folha de ações da mangueira — ambientada no jogo (exigência do usuário):
 * desliza da borda, fundo "paper", Nunito, cartões de ação próprios. Nada de
 * Modal padrão (portal, focus trap e Esc vivem em GameSheet). Os formulários
 * dentro dela gravam fatos reais nos endpoints existentes (regra de ouro).
 * Em modo revisão (`review`), a folha abre já na sub-view do fato, preenchida
 * pelo assistente, e o submit confirma pela pipeline de revisão.
 */
export function GameActionSheet({ open, state, review, initialView, onClose, onRegistered }: {
  open: boolean;
  state: GameState;
  review?: SheetReview;
  /** Sub-view inicial ao abrir sem revisão (padrão: menu de ações). */
  initialView?: MangueiraView;
  onClose: () => void;
  onRegistered: (result: SheetResult) => void;
}) {
  const [view, setView] = useState<SheetView>('menu');

  useEffect(() => {
    if (open) setView(review ? reviewView(review.action.actionType) : initialView ?? 'menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const { today } = state;
  const payload = review?.action.resolvedPayload ?? {};
  const subtitle = review
    ? 'Revise o que o assistente entendeu antes de virar fato.'
    : today.producedLiters === null
      ? 'A produção de hoje ainda não foi registrada.'
      : `Hoje: ${formatLiters(today.producedLiters)} produzidos · ${today.collectionCount === 0 ? 'nenhuma coleta' : formatLiters(today.collectedLiters) + ' coletados'}.`;

  async function handleCommit(nextPayload: Record<string, unknown>) {
    if (!review) return;
    await commitReviewAction(review.action, { ...review.action.resolvedPayload, ...nextPayload });
    review.onDone('committed');
  }

  const feedItems = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];

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
      <button type="button" className="game-sheet-action" data-testid="game-action-individual" onClick={() => setView('individual')}>
        <ClipboardList size={22} aria-hidden />
        <span><strong>Controle individual</strong><small>Medir vaca por vaca, com avanço automático.</small></span>
      </button>
    </div>}

    {view !== 'menu' && <div className="game-sheet-body">
      {!review && <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar às ações</button>}
      {review && <GameReviewNotice action={review.action} onDone={review.onDone} />}
      {view === 'dailyTotal' && (review
        ? <DailyMilkTotalForm
          reviewInitial={{
            productionDate: String(payload.productionDate ?? today.date),
            herdGroupId: payload.herdGroupId ? String(payload.herdGroupId) : '',
            morningLiters: payload.morningLiters !== null && payload.morningLiters !== undefined ? String(payload.morningLiters) : '',
            afternoonLiters: payload.afternoonLiters !== null && payload.afternoonLiters !== undefined ? String(payload.afternoonLiters) : '',
            notes: payload.notes ? String(payload.notes) : '',
          }}
          review={{ label: 'Confirmar produção', onCommit: handleCommit }}
          onSaved={() => undefined}
        />
        : <DailyMilkTotalForm onSaved={() => onRegistered('dailyTotal')} />)}
      {view === 'collection' && (review
        ? <QuickCollectionForm
          initial={{
            collectionDate: String(payload.collectionDate ?? today.date),
            liters: payload.liters !== null && payload.liters !== undefined ? String(payload.liters) : '',
            notes: payload.notes ? String(payload.notes) : '',
          }}
          review={{ label: 'Confirmar coleta', onCommit: handleCommit }}
          onSaved={() => undefined}
        />
        : <QuickCollectionForm onSaved={() => onRegistered('collection')} />)}
      {view === 'milkingFeed' && (review
        ? <FeedingEventForm
          context="MILKING"
          initial={{
            date: String(payload.date ?? today.date),
            herdGroupId: payload.herdGroupId ? String(payload.herdGroupId) : '',
            notes: payload.notes ? String(payload.notes) : '',
            lines: feedItems.map((item) => ({
              feedItemId: item.feedItemId ? String(item.feedItemId) : '',
              quantity: item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '',
              unit: 'CANONICAL' as const,
            })),
          }}
          review={{ label: 'Confirmar trato', onCommit: handleCommit }}
          onSaved={() => undefined}
        />
        : <FeedingEventForm context="MILKING" onSaved={() => onRegistered('milkingFeed')} />)}
      {view === 'individual' && <IndividualControlFlow today={today.date} onSaved={() => onRegistered('individual')} />}
    </div>}
  </GameSheet>;
}
