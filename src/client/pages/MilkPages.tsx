import { useState } from 'react';
import { ChartNoAxesCombined, Milk, Plus } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { filterByPeriod, type PeriodDays } from '../../domain/analytics';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { PeriodSelector } from '../components/PeriodSelector';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { useConfirm, useToast } from '../components/feedback-context';
import { ConfirmButton } from '../components/feedback';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, ScrollArea, SectionCard, SkeletonList } from '../components/ui';
import { FilterControls } from '../components/FilterControls';
import type { MeasurementEditValue } from '../features/milk/MilkMeasurementEditor';
import { MilkSessionMeasurementList, type Animal, type Measurement } from '../features/milk/MilkSessionMeasurementList';
import { MilkSessionEditForm } from '../features/milk/MilkSessionEditForm';
import { DailyMilkPanel } from '../features/milk/DailyMilkPanel';
import { ImportMilkReview } from '../features/milk/ImportMilkReview';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { today } from '../lib/labels';
import { formatDate, formatLiters } from '../../domain/format';
import { MilkCollectionsPanel } from './MilkCollectionPages';

type SessionSummary = { id: string; sessionDate: string; title: string | null; inputMode: string; source: string; confirmedTotal: string; confirmedCount: number; reviewCount: number };
type ProductionPoint = { id: string; date: string; totalLiters: string; source: 'DAILY_TOTAL' | 'INDIVIDUAL_CONTROL' };
type SessionDetail = { id: string; sessionDate: string; title: string | null; notes: string | null; inputMode: string; source: string; measurements: Measurement[]; missingAnimals: Array<{ id: string; name: string | null; tagNumber: string | null }>; attachments: Attachment[] };

export function MilkSessionsPage() {
  const { data, loading, error, reload } = useResource<SessionSummary[]>('/api/milk-sessions');
  const { data: timeline = [], loading: timelineLoading, error: timelineError, reload: reloadTimeline } = useResource<ProductionPoint[]>('/api/milk-production-timeline');
  const [period, setPeriod] = useState<PeriodDays>(90);
  const [sessionSearch, setSessionSearch] = useState('');
  // Uma linha por data com séries separadas: produção diária e controle individual
  // são fatos distintos e podem coexistir no mesmo dia. Sem isso, datas repetidas
  // faziam a linha única "voltar" no eixo X (o gráfico bugado).
  const productionByDate = new Map<string, { date: string; daily: number | null; individual: number | null }>();
  for (const point of timeline ?? []) {
    const row = productionByDate.get(point.date) ?? { date: point.date, daily: null, individual: null };
    if (point.source === 'DAILY_TOTAL') row.daily = Number(point.totalLiters);
    else row.individual = Number(point.totalLiters);
    productionByDate.set(point.date, row);
  }
  const chartData = filterByPeriod([...productionByDate.values()].sort((a, b) => a.date.localeCompare(b.date)), period, today());
  const filteredSessions = (data ?? []).filter((session) => `${session.title ?? ''} ${formatDate(session.sessionDate)}`.toLocaleLowerCase('pt-BR').includes(sessionSearch.toLocaleLowerCase('pt-BR')));
  return <div className="page">
    <PageHeader icon={Milk} title="Produção" subtitle="Produção total e controle individual são medições diferentes e podem existir na mesma data" action={<Link className="button button-primary" to="/producao/individual/novo"><Plus size={18} aria-hidden />Registrar controle</Link>} />
    <div className="grid grid-cols-1 gap-5"><SectionCard icon={ChartNoAxesCombined} title="Registros de produção"><PeriodSelector value={period} onChange={setPeriod} /><p className="mb-3 mt-3 text-xs text-[var(--muted)]">Produção total é o volume agregado da ordenha. Controle individual é uma medição pontual por animal. Coleta é o volume retirado pelo laticínio. Os três fatos permanecem separados, inclusive quando têm a mesma data.</p>{timelineLoading ? <LoadingState /> : timelineError ? <ErrorState message={timelineError} retry={reloadTimeline} /> : <TimeSeriesChart data={chartData} series={[{ key: 'daily', label: 'Produção diária', color: '#315c3b', area: true }, { key: 'individual', label: 'Controle individual', color: '#8a5a0a', dashed: true }]} label="Registros de produção no período selecionado" />}</SectionCard><DailyMilkPanel onChange={reloadTimeline} /><MilkCollectionsPanel /><section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Controle individual</h2><Link className="button button-secondary" to="/producao/individual/novo">Novo controle</Link></div>
    <FilterControls search={{ label: 'Buscar controle', value: sessionSearch, onChange: setSessionSearch, placeholder: 'Título ou data' }} />
    <div className="mt-3">{loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} retry={reload} /> : !filteredSessions.length ? <EmptyState title="Nenhum controle individual" description="Importe uma medição completa ou ajuste a busca." /> :<SectionCard><ScrollArea label="Controles individuais">{filteredSessions.map((session) => <Link className="mobile-item" to={`/producao/${session.id}`} key={session.id}>
      <span className="min-w-0"><strong className="block truncate">{session.title || `Controle de ${formatDate(session.sessionDate)}`}</strong><span className="text-sm text-[var(--muted)]">{formatDate(session.sessionDate)} · {session.confirmedCount} confirmados</span>{session.reviewCount > 0 && <span className="mt-1 block text-xs font-semibold text-[var(--warning)]">{session.reviewCount} aguardando revisão</span>}</span>
      <strong className="shrink-0">{formatLiters(session.confirmedTotal)}</strong>
    </Link>)}</ScrollArea></SectionCard>}</div></section></div>
  </div>;
}

/**
 * Revisão de uma transcrição de controle individual (rota de fallback —
 * o caminho principal é a folha da mangueira em modo revisão, que usa o mesmo
 * ImportMilkReview). A entrada é o Assistente (foto/áudio/texto → OCR/
 * interpretação): a captura reconhecida como controle individual abre aqui
 * via prefill. Para digitar vaca a vaca sem IA, use o controle manual em
 * /producao/individual/novo.
 */
export function ImportMilkPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { prefillJson?: string; sourceCaptureId?: string; sourceActionId?: string } | null;

  if (!locationState?.prefillJson) {
    return <div className="page"><PageHeader title="Revisar transcrição" subtitle="Controle individual vaca a vaca a partir de foto, áudio ou texto" />
      <div className="grid gap-5"><EmptyState title="Nenhuma transcrição para revisar" description="Use “Novo registro” para fotografar ou descrever o controle; o assistente transcreve e a revisão abre aqui. Para digitar vaca a vaca sem IA, use o controle manual." action={<div className="flex flex-wrap justify-center gap-2"><Link className="button button-primary" to="/producao/individual/novo">Controle manual</Link><Link className="button button-secondary" to="/?caderno=pendencias">Ver capturas para revisar</Link></div>} /></div>
    </div>;
  }

  return <div className="page"><PageHeader title="Revisar transcrição" subtitle="Confira cada linha antes de importar" />
    <ImportMilkReview
      prefillJson={locationState.prefillJson}
      sourceCaptureId={locationState.sourceCaptureId}
      sourceActionId={locationState.sourceActionId}
      onSaved={(sessionId) => navigate(`/producao/${sessionId}`)}
    />
  </div>;
}

export function MilkSessionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const toast = useToast();
  const { data, setData, loading, error, reload } = useResource<SessionDetail>(`/api/milk-sessions/${id}`);
  const { data: animals = [], reload: reloadAnimals } = useResource<Animal[]>('/api/animals');
  const [actionError, setActionError] = useState('');
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState(false);
  const [busy, setBusy] = useState(false);
  async function setStatus(measurement: Measurement, status: string) {
    setActionError('');
    try {
      await api(`/api/milk-measurements/${measurement.id}`, json('PATCH', { status }));
      setData((current) => current ? {
        ...current,
        measurements: current.measurements.map((row) => row.id === measurement.id ? {
          ...row,
          status,
          issues: status === 'NEEDS_REVIEW'
            ? [...row.issues.filter((issue) => issue !== 'Aguardando decisão e fora dos totais.'), 'Aguardando decisão e fora dos totais.']
            : row.issues.filter((issue) => issue !== 'Aguardando decisão e fora dos totais.'),
        } : row),
      } : current);
      void reload(false);
      toast(status === 'CONFIRMED' ? 'Medição confirmada' : status === 'NEEDS_REVIEW' ? 'Medição marcada para revisão' : 'Medição excluída dos totais');
    }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar.'); }
  }
  async function saveMeasurement(measurementId: string, value: MeasurementEditValue) {
    setBusy(true); setActionError('');
    try { await api(`/api/milk-measurements/${measurementId}`, json('PATCH', value)); setEditingMeasurementId(null); reload(); toast('Medição corrigida'); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível corrigir a medição.'); }
    finally { setBusy(false); }
  }
  async function saveSession(values: { sessionDate: string; title: string; notes: string }) {
    setBusy(true); setActionError('');
    try { await api(`/api/milk-sessions/${id}`, json('PATCH', { sessionDate: values.sessionDate, title: values.title.trim() || null, notes: values.notes.trim() || null })); setEditingSession(false); reload(); toast('Controle atualizado'); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível editar o controle.'); }
    finally { setBusy(false); }
  }
  async function deleteSession() {
    setBusy(true); setActionError('');
    try { await api(`/api/milk-sessions/${id}`, { method: 'DELETE' }); toast('Controle excluído'); navigate('/producao', { replace: true }); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir o controle.'); setBusy(false); }
  }
  async function excludeMeasurement(row: Measurement) {
    const accepted = await confirmAction({
      title: 'Excluir medição dos totais?',
      description: 'O valor original continuará preservado e poderá ser revisado depois.',
      confirmLabel: 'Excluir dos totais',
      tone: 'danger',
    });
    if (accepted) await setStatus(row, 'EXCLUDED');
  }
  if (loading) return <div className="page"><SkeletonList rows={5} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Controle não encontrado.'} retry={reload} /></div>;
  const confirmed = data.measurements.filter((row) => row.status === 'CONFIRMED');
  const total = confirmed.reduce((sum, row) => sum + Number(row.totalLiters ?? 0), 0);
  const review = data.measurements.filter((row) => row.status === 'NEEDS_REVIEW');
  return <div className="page"><PageHeader icon={Milk} title={data.title || `Controle de ${formatDate(data.sessionDate)}`} subtitle={`${formatDate(data.sessionDate)} · ${data.source === 'NOTEBOOK_SEED' ? 'Transcrição inicial do caderno' : data.source === 'IMPORT' ? 'Importado' : 'Registro manual'}`} action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setEditingSession(true)}>Editar</Button><ConfirmButton variant="danger" disabled={busy} question="Excluir este controle e suas medições? Esta ação não pode ser desfeita." onClick={() => void deleteSession()}>Excluir</ConfirmButton></div>} />
    <div className="grid gap-5">
      {actionError && <ErrorState message={actionError} />}
      {editingSession && <MilkSessionEditForm initialDate={data.sessionDate} initialTitle={data.title ?? ''} initialNotes={data.notes ?? ''} busy={busy} onSave={saveSession} onCancel={() => setEditingSession(false)} />}
      <div className="grid grid-cols-3 gap-3"><div className="stat-card"><span className="stat-label">Total confirmado</span><strong className="stat-value block">{formatLiters(total)}</strong></div><div className="stat-card"><span className="stat-label">Confirmados</span><strong className="stat-value block">{confirmed.length}</strong></div><div className="stat-card"><span className="stat-label">A revisar</span><strong className="stat-value block">{review.length}</strong></div></div>
      {data.notes && <div className="notice notice-info">{data.notes}</div>}{data.missingAnimals.length > 0 && <div className="notice notice-warning"><strong>{data.missingAnimals.length} vaca(s) em lactação sem medição vinculada</strong><p className="mt-1 text-xs">Isso é um aviso de conferência; não registra ausência nem produção zero.</p><details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Ver vacas sem medição</summary><p className="text-xs">{data.missingAnimals.map((animal) => animal.name || `Brinco ${animal.tagNumber}`).join(', ')}.</p></details></div>}
      <MilkSessionMeasurementList sessionId={id} sessionDate={data.sessionDate} measurements={data.measurements} animals={animals ?? []} busy={busy} editingMeasurementId={editingMeasurementId} setEditingMeasurementId={setEditingMeasurementId} setStatus={setStatus} saveMeasurement={saveMeasurement} excludeMeasurement={excludeMeasurement} reload={reload} reloadAnimals={reloadAnimals} />
      <SectionCard title="Documentos do controle"><AttachmentPanel attachments={data.attachments} milkSessionId={id} onChange={reload} /></SectionCard>
    </div>
  </div>;
}
