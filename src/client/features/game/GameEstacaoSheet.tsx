import type { FeedingContext } from '../../../domain/feeding';
import { FeedingEventForm } from '../feeding/FeedingEventForm';
import { GameEntitySheet } from './GameEntitySheet';
import { GameReviewNotice } from './GameReviewNotice';
import { commitReviewAction, type SheetReview } from './review';
import { EstacaoAlimentacaoSprite } from './sprites/EstacaoAlimentacaoSprite';

const FEEDING_CONTEXTS: FeedingContext[] = ['MILKING', 'STATION', 'PASTURE'];

/**
 * Folha do Cocho (kind ESTACAO_ALIMENTACAO — valor do enum preservado, só os
 * rótulos mudaram): registrar o trato dado (contexto STATION), com o saldo
 * derivado de cada item visível linha a linha. Grava o fato real em
 * /api/feeding-events. Em modo revisão, o trato falado abre preenchido com o
 * contexto interpretado (estação/pasto) e confirma pela pipeline de revisão.
 */
export function GameEstacaoSheet({ open, review, onClose, onRegistered }: {
  open: boolean;
  review?: SheetReview;
  onClose: () => void;
  onRegistered: () => void;
}) {
  if (!open) return null;
  const payload = review?.action.resolvedPayload ?? {};
  const context = FEEDING_CONTEXTS.includes(payload.context as FeedingContext) ? payload.context as FeedingContext : 'STATION';
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];

  async function handleCommit(nextPayload: Record<string, unknown>) {
    if (!review) return;
    await commitReviewAction(review.action, { ...review.action.resolvedPayload, ...nextPayload });
    review.onDone('committed');
  }

  return <GameEntitySheet open={open} label="Cocho" testid="game-estacao-sheet" title="Cocho" subtitle={review ? 'Revise o trato que o assistente entendeu.' : 'Registrar o trato dado ao rebanho.'} onClose={onClose} sprite={<EstacaoAlimentacaoSprite x={32} y={32} size={64} />}>
    {review && <GameReviewNotice action={review.action} onDone={review.onDone} />}
    {review
      ? <FeedingEventForm
        context={context}
        initial={{
          date: String(payload.date ?? ''),
          herdGroupId: payload.herdGroupId ? String(payload.herdGroupId) : '',
          notes: payload.notes ? String(payload.notes) : '',
          lines: items.map((item) => ({
            feedItemId: item.feedItemId ? String(item.feedItemId) : '',
            quantity: item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '',
            unit: 'CANONICAL' as const,
          })),
        }}
        review={{ label: 'Confirmar trato', onCommit: handleCommit }}
        onSaved={() => undefined}
      />
      : <FeedingEventForm context="STATION" onSaved={onRegistered} />}
  </GameEntitySheet>;
}
