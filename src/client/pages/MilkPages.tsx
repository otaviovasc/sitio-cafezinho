import { useCallback, useEffect, useState } from 'react';
import { ChartNoAxesCombined, Milk, Plus } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { filterByPeriod, type PeriodDays } from '../../domain/analytics';
import type { MilkingRoutine } from '../../domain/herd';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { PeriodSelector } from '../components/PeriodSelector';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { useConfirm, useToast } from '../components/feedback-context';
import { ConfirmButton } from '../components/feedback';
import { ParsedDecimalInput } from '../components/form-controls';
import { Button, EmptyState, ErrorState, Field, LoadingState, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatCard, StatusBadge } from '../components/ui';
import { FilterControls } from '../components/FilterControls';
import { milkMeasurementStatusDescriptor } from '../lib/status';
import type { MeasurementEditValue } from '../features/milk/MilkMeasurementEditor';
import { MilkSessionMeasurementList, type Animal, type Measurement } from '../features/milk/MilkSessionMeasurementList';
import { MilkSessionEditForm } from '../features/milk/MilkSessionEditForm';
import { DailyMilkPanel } from '../features/milk/DailyMilkPanel';
import { QuickAnimalForm } from '../features/animals/QuickAnimalForm';
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

type Preview = {
  sessionDate: string;
  sourceMode: string;
  sessionIssues: string[];
  sessionWarnings?: string[];
  missingAnimals: Array<{ id: string; name: string | null; tagNumber: string | null }>;
  measurements: Array<{ rawAnimalLabel: string; rawValueText?: string | null; morningLiters: number | null; afternoonLiters: number | null; totalLiters: number | null; confidence: string; status: string; notes?: string | null; animalId: string | null; matchedAnimal: Animal | null; milkingRoutine: MilkingRoutine | null; issues: string[] }>;
};

/**
 * Revisão de uma transcrição de controle individual. A entrada é o Assistente
 * (foto/áudio/texto → OCR/interpretação): a captura reconhecida como controle
 * individual abre aqui via prefill. Para digitar vaca a vaca sem IA, use o
 * controle manual em /producao/individual/novo.
 */
export function ImportMilkPage() {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState('ISSUES');
  const [showQuickAnimal, setShowQuickAnimal] = useState(false);
  const { data: animals, reload: reloadAnimals } = useResource<Animal[]>('/api/animals');
  const navigate = useNavigate();
  const location = useLocation();

  const validate = useCallback(async (raw: string) => {
    setBusy(true); setError('');
    try { setPreview(await api<Preview>('/api/import/milk-session/validate', json('POST', { content: raw }))); toast('Transcrição carregada. Revise cada linha antes de importar.'); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Não foi possível validar a transcrição.'); }
    finally { setBusy(false); }
  }, [toast]);

  useEffect(() => {
    const prefill = (location.state as { prefillJson?: string } | null)?.prefillJson;
    if (prefill) void validate(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(index: number, values: Partial<Preview['measurements'][number]>) {
    if (!preview) return;
    setPreview({ ...preview, measurements: preview.measurements.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row) });
  }
  function updatePeriod(index: number, period: 'morningLiters' | 'afternoonLiters', value: number | null) {
    if (!preview) return;
    const row = preview.measurements[index];
    const morning = period === 'morningLiters' ? value : row.morningLiters;
    const afternoon = period === 'afternoonLiters' ? value : row.afternoonLiters;
    update(index, { [period]: value, totalLiters: morning === null && afternoon === null ? null : (morning ?? 0) + (afternoon ?? 0) });
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const created = await api<{ id: string }>('/api/import/milk-session', json('POST', {
        sessionDate: preview.sessionDate,
        inputMode: preview.sourceMode === 'UNKNOWN' ? 'MIXED' : preview.sourceMode,
        title: 'Controle importado',
        measurements: preview.measurements.map((row) => {
          const measurement = { ...row };
          delete (measurement as Partial<typeof row>).matchedAnimal;
          return measurement;
        }),
      }));
      toast('Controle individual importado');
      navigate(`/producao/${created.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível importar.'); }
    finally { setBusy(false); }
  }

  if (busy && !preview) return <div className="page"><PageHeader title="Revisar transcrição" subtitle="Conferindo a transcrição do assistente" /><SkeletonList rows={5} /></div>;
  if (!preview) return <div className="page"><PageHeader title="Revisar transcrição" subtitle="Controle individual vaca a vaca a partir de foto, áudio ou texto" />
    <div className="grid gap-5">{error && <ErrorState message={error} />}<EmptyState title="Nenhuma transcrição para revisar" description="Use “Novo registro” para fotografar ou descrever o controle; o assistente transcreve e a revisão abre aqui. Para digitar vaca a vaca sem IA, use o controle manual." action={<div className="flex flex-wrap justify-center gap-2"><Link className="button button-primary" to="/producao/individual/novo">Controle manual</Link><Link className="button button-secondary" to="/revisar">Ver capturas para revisar</Link></div>} /></div>
  </div>;

  const visibleRows = preview.measurements.map((row, index) => ({ row, index })).filter(({ row }) => {
    const matchesSearch = `${row.rawAnimalLabel} ${row.matchedAnimal?.name ?? ''} ${row.matchedAnimal?.tagNumber ?? ''}`.toLocaleLowerCase('pt-BR').includes(reviewSearch.toLocaleLowerCase('pt-BR'));
    const matchesFilter = reviewFilter === 'ALL' || (reviewFilter === 'ISSUES' && (row.issues.length > 0 || row.status === 'NEEDS_REVIEW')) || row.status === reviewFilter;
    return matchesSearch && matchesFilter;
  });
  const invalidMeasurementCount = preview.measurements.filter((row) => row.status !== 'EXCLUDED' && row.totalLiters === null).length;

  return <div className="page"><PageHeader title="Revisar transcrição" subtitle="Confira cada linha antes de importar" />
    <div className="grid gap-5">
      {error && <ErrorState message={error} />}
      <SectionCard title="Revisar o controle" action={<Button variant="secondary" onClick={() => setShowQuickAnimal((value) => !value)}><Plus size={17} aria-hidden />Cadastrar vaca</Button>}>{showQuickAnimal && <div className="mb-4"><QuickAnimalForm initialDate={preview.sessionDate} onCancel={() => setShowQuickAnimal(false)} onCreated={async () => { await reloadAnimals(); setShowQuickAnimal(false); }} /></div>}<div className="mb-4 grid grid-cols-3 gap-3"><StatCard label="Confirmadas" value={preview.measurements.filter((row) => row.status === 'CONFIRMED').length} /><StatCard label="A revisar" value={preview.measurements.filter((row) => row.status === 'NEEDS_REVIEW').length} /><StatCard label="Sem medição" value={preview.missingAnimals.length} /></div>
        {preview.sessionIssues.length > 0 && <div className="notice notice-error mb-4"><strong>Corrija antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        {(preview.sessionWarnings?.length ?? 0) > 0 && <div className="notice notice-warning mb-4"><strong>Confira antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionWarnings?.map((issue) => <li key={issue}>{issue}</li>)}</ul>{preview.missingAnimals.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Ver vacas sem medição vinculada</summary><p className="text-xs">{preview.missingAnimals.map((animal) => animal.name || `Brinco ${animal.tagNumber}`).join(', ')}.</p></details>}<p className="mt-2 text-xs">Isso não impede salvar: o controle individual pode ser pontual e não registra ausência nem produção zero.</p></div>}
        <FilterControls search={{ value: reviewSearch, onChange: setReviewSearch, placeholder: 'Nome, brinco ou original' }} selects={[{ label: 'Mostrar', value: reviewFilter, onChange: setReviewFilter, options: [{ value: 'ISSUES', label: 'Inconsistências primeiro' }, { value: 'ALL', label: 'Todas' }, { value: 'NEEDS_REVIEW', label: 'Aguardando revisão' }, { value: 'CONFIRMED', label: 'Confirmadas' }, { value: 'EXCLUDED', label: 'Excluídas' }] }] } />
        <ScrollArea label="Linhas da revisão do controle" className="mt-4 max-h-[46rem]">{visibleRows.map(({ row, index }) => <div className={`review-row ${row.status === 'NEEDS_REVIEW' ? 'review-row-warning' : ''}`} key={`${row.rawAnimalLabel}-${index}`}>
          <div className="mb-3 flex items-start justify-between gap-3"><div><span className="text-xs font-semibold text-[var(--muted)]">Linha {index + 1}</span><strong className="block">{row.rawAnimalLabel}</strong><p className="text-xs text-[var(--muted)]">Original preservado{row.rawValueText ? ` · “${row.rawValueText}”` : ''}</p></div><StatusBadge descriptor={milkMeasurementStatusDescriptor[row.status] ?? milkMeasurementStatusDescriptor.NEEDS_REVIEW} /></div>
          {row.issues.length > 0 && <div className="notice notice-warning mb-3"><ul className="list-disc pl-5">{row.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Field label="Animal vinculado"><Select value={row.animalId || ''} onChange={(event) => update(index, { animalId: event.target.value || null })}><option value="">Sem vínculo</option>{animals?.map((animal) => <option key={animal.id} value={animal.id}>{animal.name || `Brinco ${animal.tagNumber}`}</option>)}</Select></Field><Field label="Manhã (L)"><ParsedDecimalInput suffix="L" value={row.morningLiters} onValueChange={(value) => updatePeriod(index, 'morningLiters', value)} /></Field><Field label="Tarde (L)"><ParsedDecimalInput suffix="L" value={row.afternoonLiters} onValueChange={(value) => updatePeriod(index, 'afternoonLiters', value)} /></Field><Field label="Total (L)" hint="Recalculado pela manhã e tarde" error={row.status !== 'EXCLUDED' && row.totalLiters === null ? 'Informe manhã ou tarde, ou mantenha a linha excluída.' : undefined}><ParsedDecimalInput suffix="L" value={row.totalLiters} onValueChange={() => undefined} readOnly aria-readonly /></Field><Field label="Situação"><Select value={row.status} onChange={(event) => update(index, { status: event.target.value })}><option value="CONFIRMED">Confirmado</option><option value="NEEDS_REVIEW">Aguardando revisão</option><option value="EXCLUDED">Excluído</option></Select></Field></div>
          {!row.animalId && row.status !== 'EXCLUDED' && <p className="mt-2 text-xs text-[var(--warning)]">Se for uma vaca nova, você poderá cadastrar e vincular várias de uma vez depois de salvar o controle.</p>}{row.notes && <p className="mt-2 text-xs text-[var(--muted)]">{row.notes}</p>}
        </div>)}</ScrollArea><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className={`text-xs ${invalidMeasurementCount ? 'font-semibold text-[var(--danger)]' : 'text-[var(--muted)]'}`}>{invalidMeasurementCount ? `${invalidMeasurementCount} linha(s) precisa(m) de um valor ou deve(m) permanecer excluída(s).` : 'Linhas “a revisar” ficam fora dos totais até serem confirmadas.'}</p><Button className="w-full sm:w-auto" disabled={busy || preview.sessionIssues.length > 0 || invalidMeasurementCount > 0} onClick={() => void confirm()}>{busy ? 'Importando…' : 'Salvar controle revisado'}</Button></div></SectionCard>
    </div>
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
