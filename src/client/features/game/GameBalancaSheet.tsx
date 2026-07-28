import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import { formatDate } from '../../../domain/format';
import { formatWeight } from '../../../domain/weight';
import { ErrorState, SkeletonList } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { GameEntitySheet, type GameEntityAction } from './GameEntitySheet';
import { GameReviewNotice } from './GameReviewNotice';
import { type SheetReview } from './review';
import { WeighingQueueFlow } from './actions/WeighingQueueFlow';
import { WeighingReviewFlow } from './actions/WeighingReviewFlow';
import { BalancaSprite } from './sprites/BalancaSprite';

type WeightSessionSummary = { id: string; measuredOn: string; title: string | null; confirmedCount: number; reviewCount: number; averageWeight: string };

type SheetView = 'menu' | 'queue' | 'review';

/**
 * Folha da Balança: a pesagem do rebanho no jogo. A sessão acontece como FILA
 * vaca a vaca (WeighingQueueFlow — sessão parcial permitida, avanço
 * automático) gravando no POST /api/weight-sessions real. As últimas sessões
 * aparecem abaixo e abrem a página de detalhe do app, onde a correção linha a
 * linha continua acontecendo. Em modo revisão (pesagem falada/fotografada), as
 * linhas interpretadas abrem no WeighingReviewFlow e confirmam pela pipeline
 * de revisão.
 */
export function GameBalancaSheet({ open, today, review, onClose, onRegistered }: {
  open: boolean;
  today: string;
  review?: SheetReview;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [view, setView] = useState<SheetView>('menu');
  const { data: sessions, loading, error, reload } = useResource<WeightSessionSummary[]>('/api/weight-sessions');

  useEffect(() => {
    if (open) setView(review ? 'review' : 'menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const recent = (sessions ?? []).slice(0, 5);

  const actions: GameEntityAction[] = [
    { icon: <Scale size={22} aria-hidden />, label: 'Nova pesagem', hint: 'Fila vaca a vaca, direto no campo. Pode pesar só uma parte do rebanho.', testid: 'game-balanca-new', onClick: () => setView('queue') },
  ];

  return <GameEntitySheet open={open} label="Balança" testid="game-balanca-sheet" title="Balança" subtitle={review ? 'Revise a pesagem que o assistente entendeu.' : 'Peso é medição pontual: só entra quem passou na balança.'} onClose={onClose} sprite={<BalancaSprite x={32} y={32} size={64} />} actions={view === 'menu' ? actions : undefined}>
    {view === 'review' && review && <>
      <GameReviewNotice action={review.action} onDone={review.onDone} />
      <WeighingReviewFlow action={review.action} onCommitted={() => review.onDone('committed')} />
    </>}
    {view === 'queue' && <>
      <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar à balança</button>
      <WeighingQueueFlow today={today} onSaved={onRegistered} />
    </>}

    {view === 'menu' && <div className="grid gap-1.5">
      <p className="game-notebook-heading">Últimas pesagens</p>
      {loading && !sessions && <SkeletonList rows={2} />}
      {error && <ErrorState message={error} retry={() => void reload()} />}
      {sessions && !recent.length && <p className="game-notebook-empty">Nenhuma pesagem registrada ainda.</p>}
      {recent.map((session) => <Link key={session.id} className="game-sheet-action" data-testid={`game-balanca-session-${session.id}`} to={`/pesos/${session.id}`}>
        <span className="min-w-0 flex-1 text-left"><strong>{session.title || `Pesagem de ${formatDate(session.measuredOn)}`}</strong><small>{formatDate(session.measuredOn)} · {session.confirmedCount} confirmada(s){session.reviewCount > 0 ? ` · ${session.reviewCount} a revisar` : ''}</small></span>
        <strong>{formatWeight(session.averageWeight)}</strong>
      </Link>)}
      {recent.length > 0 && <p className="game-notebook-empty">Tocar abre a sessão no app, onde cada linha pode ser corrigida.</p>}
    </div>}
  </GameEntitySheet>;
}
