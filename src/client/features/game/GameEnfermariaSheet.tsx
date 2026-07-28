import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, HeartPulse, Pencil } from 'lucide-react';
import { formatDate } from '../../../domain/format';
import { ErrorState, SkeletonList, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/feedback-context';
import { useResource } from '../../hooks/useResource';
import { MastitisActions, MastitisCaseForm, WithdrawalNotice, type MastitisCase, type MastitisCaseDetail } from '../health/mastitis';
import { dateFromTimestamp, mastitisAnimalName } from '../health/mastitis-utils';
import { mastitisOutcomeLabel, mastitisQuarterLabel, mastitisStatusDescriptor } from '../../lib/status';
import { GameEntitySheet, type GameEntityAction } from './GameEntitySheet';
import { GameReviewNotice } from './GameReviewNotice';
import { commitReviewAction, type SheetReview } from './review';
import { EnfermariaSprite } from './sprites/EnfermariaSprite';

type SheetView = 'menu' | 'new' | 'case' | 'review';

function withdrawalText(item: MastitisCase): string | null {
  if (!item.withdrawalEndsAt || !item.withdrawal) return null;
  const base = `Carência informada até ${formatDate(item.withdrawalEndsAt)}`;
  if (item.withdrawal.state === 'ACTIVE') return `${base} · ${item.withdrawal.days} dia(s) restante(s)`;
  if (item.withdrawal.state === 'ENDS_TODAY') return `${base} · termina hoje`;
  return `${base} · data passou há ${Math.abs(item.withdrawal.days)} dia(s)`;
}

/** Detalhe do caso dentro da folha: ações programadas/concluídas e desfecho. */
function EnfermariaCaseDetail({ caseId, onBack, onChanged }: { caseId: string; onBack: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useResource<MastitisCaseDetail>(`/api/mastitis-cases/${caseId}`);
  const [editing, setEditing] = useState(false);

  function handleReload() {
    void reload(false);
    onChanged();
  }

  if (loading && !data) return <><button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à enfermaria</button><SkeletonList rows={3} /></>;
  if (error || !data) return <><button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à enfermaria</button><ErrorState message={error || 'Caso não encontrado.'} retry={() => void reload()} /></>;

  if (editing) return <>
    <button type="button" className="game-sheet-back" onClick={() => setEditing(false)}><ArrowLeft size={16} aria-hidden />Voltar ao caso</button>
    <MastitisCaseForm initial={data} onSaved={() => { setEditing(false); handleReload(); }} />
  </>;

  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à enfermaria</button>
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-lg">{mastitisAnimalName(data)}</strong>
        <StatusBadge descriptor={mastitisStatusDescriptor[data.status]} />
      </div>
      <p className="game-notebook-subtitle">Detectado em {formatDate(dateFromTimestamp(data.detectedAt))}</p>
    </div>
    <div className="mb-3"><button type="button" className="game-sheet-action" data-testid="game-enfermaria-edit" onClick={() => setEditing(true)}>
      <Pencil size={22} aria-hidden />
      <span><strong>Editar caso e desfecho</strong><small>Tratamento informado, carência, resultado e observações.</small></span>
    </button></div>
    {data.observedSigns && <p className="mb-3 text-sm">{data.observedSigns}</p>}
    <dl className="game-notebook-fields mb-3">
      {data.affectedQuarter && <div><dt>Teto</dt><dd>{mastitisQuarterLabel[data.affectedQuarter]}</dd></div>}
      {data.treatmentSummary && <div><dt>Tratamento</dt><dd>{data.treatmentSummary}</dd></div>}
      {data.outcome && <div><dt>Resultado</dt><dd>{mastitisOutcomeLabel[data.outcome]}</dd></div>}
    </dl>
    <div className="mb-3"><WithdrawalNotice withdrawalEndsAt={data.withdrawalEndsAt} withdrawal={data.withdrawal} /></div>
    <MastitisActions item={data} reload={handleReload} />
    <Link className="game-notebook-link" to={`/mastite/${data.id}`}>Abrir caso no app</Link>
  </>;
}

/**
 * Folha da Enfermaria: os cuidados de saúde no jogo. Lista os casos de
 * mastite em aberto (com a carência derivada pelo servidor), registra caso
 * novo pelo formulário real de observação (sinal percebido, decisão humana,
 * tratamento informado — nunca diagnóstico automático) e abre o detalhe do
 * caso com ações e desfecho.
 */
export function GameEnfermariaSheet({ open, review, onClose, onChanged }: {
  open: boolean;
  review?: SheetReview;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<SheetView>('menu');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const { data: cases, loading, error, reload } = useResource<MastitisCase[]>('/api/mastitis-cases');

  useEffect(() => {
    if (open) setView(review ? 'review' : 'menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const openCases = (cases ?? []).filter((item) => !['RESOLVED', 'CANCELLED'].includes(item.status));
  const payload = review?.action.resolvedPayload ?? {};

  function handleChanged() {
    void reload(false);
    onChanged();
  }

  async function handleCommit(nextPayload: Record<string, unknown>) {
    if (!review) return;
    await commitReviewAction(review.action, { ...review.action.resolvedPayload, ...nextPayload });
    review.onDone('committed');
  }

  const actions: GameEntityAction[] = [
    { icon: <HeartPulse size={22} aria-hidden />, label: 'Registrar mastite', hint: 'Sinal observado e decisão humana — o sistema não diagnostica.', testid: 'game-enfermaria-new', onClick: () => setView('new') },
  ];

  return <GameEntitySheet open={open} label="Enfermaria" testid="game-enfermaria-sheet" title="Enfermaria" subtitle={review ? 'Revise o caso que o assistente entendeu.' : 'Observação, ação e carência — sempre com decisão humana.'} onClose={onClose} sprite={<EnfermariaSprite x={32} y={32} size={64} />} actions={view === 'menu' ? actions : undefined}>
    {view === 'review' && review && <>
      <GameReviewNotice action={review.action} onDone={review.onDone} />
      <MastitisCaseForm
        reviewInitial={{
          animalId: payload.animalId ? String(payload.animalId) : '',
          detectedOn: dateFromTimestamp(typeof payload.detectedAt === 'string' ? payload.detectedAt : null),
          observedSigns: payload.observedSigns ? String(payload.observedSigns) : '',
          affectedQuarter: payload.affectedQuarter && payload.affectedQuarter !== 'UNKNOWN' ? String(payload.affectedQuarter) : '',
          detectionMethod: payload.detectionMethod && payload.detectionMethod !== 'UNKNOWN' ? String(payload.detectionMethod) : '',
          notes: payload.notes ? String(payload.notes) : '',
        }}
        review={{ label: 'Confirmar caso', onCommit: handleCommit }}
        onSaved={() => undefined}
      />
    </>}
    {view === 'new' && <>
      <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar à enfermaria</button>
      <MastitisCaseForm onSaved={() => { toast('Caso de mastite registrado'); setView('menu'); handleChanged(); }} />
    </>}

    {view === 'case' && selectedCaseId && <EnfermariaCaseDetail caseId={selectedCaseId} onBack={() => { setView('menu'); setSelectedCaseId(null); }} onChanged={handleChanged} />}

    {view === 'menu' && <div className="grid gap-1.5">
      <p className="game-notebook-heading">Casos em aberto</p>
      {loading && !cases && <SkeletonList rows={2} />}
      {error && <ErrorState message={error} retry={() => void reload()} />}
      {cases && !openCases.length && <p className="game-notebook-empty">Nenhum caso em aberto. Observação, tratamento ou carência aparecem aqui.</p>}
      {openCases.map((item) => <button key={item.id} type="button" className="game-sheet-action" data-testid={`game-enfermaria-case-${item.id}`} onClick={() => { setSelectedCaseId(item.id); setView('case'); }}>
        <span className="min-w-0 flex-1 text-left"><strong>{mastitisAnimalName(item)}</strong><small>Detectada em {formatDate(dateFromTimestamp(item.detectedAt))}{withdrawalText(item) ? ` · ${withdrawalText(item)}` : ''}</small></span>
        <StatusBadge descriptor={mastitisStatusDescriptor[item.status]} />
      </button>)}
    </div>}
  </GameEntitySheet>;
}
