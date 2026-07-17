import { useEffect, useState } from 'react';
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
import { Badge, Button, EmptyState, ErrorState, Field, FilterBar, InlineEmpty, Input, LoadingState, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatCard, StatusBadge, Textarea } from '../components/ui';
import { milkMeasurementStatusDescriptor } from '../lib/status';
import { MilkMeasurementEditor, type MeasurementEditValue } from '../features/milk/MilkMeasurementEditor';
import { BulkRegisterAnimalsPanel } from '../features/milk/BulkRegisterAnimalsPanel';
import { DailyMilkPanel } from '../features/milk/DailyMilkPanel';
import { QuickAnimalForm } from '../features/animals/QuickAnimalForm';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { today } from '../lib/labels';
import { formatDate, formatLiters } from '../../domain/format';
import { MilkCollectionsPanel } from './MilkCollectionPages';

type Animal = { id: string; name: string | null; tagNumber: string | null; status: string; currentGroup: null | { id: string; name: string; milkingRoutine: MilkingRoutine } };
type SessionSummary = { id: string; sessionDate: string; title: string | null; inputMode: string; source: string; confirmedTotal: string; confirmedCount: number; reviewCount: number };
type ProductionPoint = { id: string; date: string; totalLiters: string; source: 'DAILY_TOTAL' | 'INDIVIDUAL_CONTROL' };
type Measurement = {
  id: string; animalId: string | null; animalName: string | null; tagNumber: string | null; rawAnimalLabel: string; rawValueText: string | null;
  morningLiters: string | null; afternoonLiters: string | null; totalLiters: string | null; confidence: string; status: string; notes: string | null;
  issues: string[]; estimate: null | { morning: number; afternoon: number; description: string };
};
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
    <PageHeader icon={Milk} title="Produção" subtitle="Produção total e controle individual são medições diferentes e podem existir na mesma data" action={<Link className="button button-primary" to="/producao/importar"><Plus size={18} aria-hidden />Importar controle</Link>} />
    <div className="grid grid-cols-1 gap-5"><SectionCard icon={ChartNoAxesCombined} title="Registros de produção"><PeriodSelector value={period} onChange={setPeriod} /><p className="mb-3 mt-3 text-xs text-[var(--muted)]">Produção total é o volume agregado da ordenha. Controle individual é uma medição pontual por animal. Coleta é o volume retirado pelo laticínio. Os três fatos permanecem separados, inclusive quando têm a mesma data.</p>{timelineLoading ? <LoadingState /> : timelineError ? <ErrorState message={timelineError} retry={reloadTimeline} /> : <TimeSeriesChart data={chartData} series={[{ key: 'daily', label: 'Produção diária', color: '#315c3b', area: true }, { key: 'individual', label: 'Controle individual', color: '#8a5a0a', dashed: true }]} label="Registros de produção no período selecionado" />}</SectionCard><DailyMilkPanel onChange={reloadTimeline} /><MilkCollectionsPanel /><section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Controle individual</h2><Link className="button button-secondary" to="/producao/importar">Importar transcrição</Link></div>
    <FilterBar><Field label="Buscar controle"><Input type="search" value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="Título ou data" /></Field></FilterBar>
    <div className="mt-3">{loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} retry={reload} /> : !filteredSessions.length ? <EmptyState title="Nenhum controle individual" description="Importe uma medição completa ou ajuste a busca." /> :<SectionCard><ScrollArea label="Controles individuais">{filteredSessions.map((session) => <Link className="mobile-item" to={`/producao/${session.id}`} key={session.id}>
      <span className="min-w-0"><strong className="block truncate">{session.title || `Controle de ${formatDate(session.sessionDate)}`}</strong><span className="text-sm text-[var(--muted)]">{formatDate(session.sessionDate)} · {session.confirmedCount} confirmados</span>{session.reviewCount > 0 && <span className="mt-1 block text-xs font-semibold text-[var(--warning)]">{session.reviewCount} aguardando revisão</span>}</span>
      <strong className="shrink-0">{formatLiters(session.confirmedTotal)}</strong>
    </Link>)}</ScrollArea></SectionCard>}</div></section></div>
  </div>;
}

const TRANSCRIPTION_PROMPT = `Você está transcrevendo um controle de produção de leite de vacas.

Vou enviar uma ou mais fotos de páginas de caderno.

A data do controle é: {{SESSION_DATE}}.

Normalmente haverá uma foto da produção da manhã e outra da tarde. As fotos também podem conter partes diferentes da mesma lista.

Sua tarefa é transcrever os dados com muito cuidado.

Regras:

- Preserve o nome ou número do animal exatamente como aparece.
- Não corrija nomes por conta própria.
- Não invente animais ou valores.
- Inclua todas as vacas que aparecem nas fotos; não descarte linhas duvidosas.
- Use ponto como separador decimal no JSON.
- Se manhã e tarde estiverem separadas, associe os registros apenas quando o nome ou número permitir uma correspondência segura.
- Se a correspondência for incerta, não force a união. Explique em notes.
- Calcule totalLiters como manhã + tarde.
- Se uma vaca estiver no lote ordenhado somente pela manhã, deixe afternoonLiters null e explique em notes.
- Se um valor estiver ilegível, use null e confidence LOW.
- Se uma linha estiver riscada, use excluded true. Os três campos de litros podem ser null quando nenhum valor estiver legível.
- Se o rótulo estiver totalmente ilegível, use exatamente "[rótulo ilegível]" em rawAnimalLabel; nunca use null nesse campo.
- Em rawValueText, copie os valores exatamente como aparecem (por exemplo "10 + 7" ou "13?"). Use null somente se nenhum valor estiver legível.
- Se houver interrogação ou dúvida, use confidence LOW.
- Não descarte linhas duvidosas.
- Não inclua explicações fora do JSON.
- Não use blocos Markdown.
- Retorne somente JSON válido.

Formato obrigatório:

{
  "sessionDate": "{{SESSION_DATE}}",
  "sourceMode": "SEPARATE_MORNING_AFTERNOON",
  "measurements": [
    {
      "rawAnimalLabel": "Caruja",
      "rawValueText": "12 + 9",
      "morningLiters": 12.0,
      "afternoonLiters": 9.0,
      "totalLiters": 21.0,
      "confidence": "HIGH",
      "excluded": false,
      "notes": null
    }
  ]
}

Use sempre sourceMode SEPARATE_MORNING_AFTERNOON para controles novos.

Valores aceitos para confidence:

- HIGH
- MEDIUM
- LOW

Quando estiver riscado:

{
  "rawAnimalLabel": "[rótulo ilegível]",
  "rawValueText": null,
  "morningLiters": null,
  "afternoonLiters": null,
  "totalLiters": null,
  "confidence": "LOW",
  "excluded": true,
  "notes": "Linha riscada; rótulo e valor ilegíveis"
}`;

const exampleJson = (date: string) => JSON.stringify({ sessionDate: date, sourceMode: 'SEPARATE_MORNING_AFTERNOON', measurements: [{ rawAnimalLabel: 'Caruja', rawValueText: '12 + 9', morningLiters: 12, afternoonLiters: 9, totalLiters: 21, confidence: 'HIGH', excluded: false, notes: null }] }, null, 2);

type Preview = {
  sessionDate: string;
  sourceMode: string;
  sessionIssues: string[];
  sessionWarnings?: string[];
  missingAnimals: Array<{ id: string; name: string | null; tagNumber: string | null }>;
  measurements: Array<{ rawAnimalLabel: string; rawValueText?: string | null; morningLiters: number | null; afternoonLiters: number | null; totalLiters: number | null; confidence: string; status: string; notes?: string | null; animalId: string | null; matchedAnimal: Animal | null; milkingRoutine: MilkingRoutine | null; issues: string[] }>;
};

export function ImportMilkPage() {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewFilter, setReviewFilter] = useState('ISSUES');
  const [showQuickAnimal, setShowQuickAnimal] = useState(false);
  const { data: animals, reload: reloadAnimals } = useResource<Animal[]>('/api/animals');
  const navigate = useNavigate();
  const location = useLocation();
  const prompt = TRANSCRIPTION_PROMPT.replaceAll('{{SESSION_DATE}}', date);

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); toast('Prompt copiado'); }
    catch { setError('Não foi possível copiar automaticamente. Selecione o texto abaixo.'); }
  }
  async function validate(raw: string = content) {
    setBusy(true); setError('');
    try { setPreview(await api<Preview>('/api/import/milk-session/validate', json('POST', { content: raw }))); toast('Dados válidos. Revise cada linha antes de importar.'); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Não foi possível validar.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const prefill = (location.state as { prefillJson?: string } | null)?.prefillJson;
    if (prefill) { setContent(prefill); void validate(prefill); }
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

  const visibleRows = preview?.measurements.map((row, index) => ({ row, index })).filter(({ row }) => {
    const matchesSearch = `${row.rawAnimalLabel} ${row.matchedAnimal?.name ?? ''} ${row.matchedAnimal?.tagNumber ?? ''}`.toLocaleLowerCase('pt-BR').includes(reviewSearch.toLocaleLowerCase('pt-BR'));
    const matchesFilter = reviewFilter === 'ALL' || (reviewFilter === 'ISSUES' && (row.issues.length > 0 || row.status === 'NEEDS_REVIEW')) || row.status === reviewFilter;
    return matchesSearch && matchesFilter;
  }) ?? [];
  const invalidMeasurementCount = preview?.measurements.filter((row) => row.status !== 'EXCLUDED' && row.totalLiters === null).length ?? 0;

  return <div className="page"><PageHeader title="Importar transcrição" subtitle="Transcreva as fotos e revise antes de salvar" />
    <div className="grid gap-5">
      <div className="notice notice-info"><strong>Como funciona</strong><br />Copie o prompt abaixo, use-o em um assistente de transcrição junto com as fotos da manhã e da tarde e cole aqui somente o JSON retornado. Linhas riscadas, incompletas ou ilegíveis serão preservadas para revisão.</div>
      {error && <ErrorState message={error} />}
      <SectionCard title="1. Preparar o prompt" action={<Button variant="secondary" onClick={() => void copyPrompt()}>Copiar prompt</Button>}><Field label="Data da sessão"><Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPreview(null); }} /></Field><details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Ver prompt completo</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f0efe8] p-3 text-xs leading-5">{prompt}</pre></details></SectionCard>
      <SectionCard title="2. Colar e validar"><Field label="JSON da transcrição" hint="Aceita linhas excluídas sem litros e preserva rótulos ilegíveis para revisão."><Textarea className="min-h-64 font-mono text-sm" value={content} onChange={(event) => { setContent(event.target.value); setPreview(null); setError(''); }} /></Field><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setContent(exampleJson(date)); setError(''); }}>Carregar exemplo</Button><Button disabled={busy || !content.trim()} onClick={() => void validate()}>{busy ? 'Validando…' : 'Validar dados'}</Button></div></SectionCard>
      {preview && <SectionCard title="3. Revisar o controle" action={<Button variant="secondary" onClick={() => setShowQuickAnimal((value) => !value)}><Plus size={17} aria-hidden />Cadastrar vaca</Button>}>{showQuickAnimal && <div className="mb-4"><QuickAnimalForm initialDate={preview.sessionDate} onCancel={() => setShowQuickAnimal(false)} onCreated={async () => { await reloadAnimals(); setShowQuickAnimal(false); }} /></div>}<div className="mb-4 grid grid-cols-3 gap-3"><StatCard label="Confirmadas" value={preview.measurements.filter((row) => row.status === 'CONFIRMED').length} /><StatCard label="A revisar" value={preview.measurements.filter((row) => row.status === 'NEEDS_REVIEW').length} /><StatCard label="Sem medição" value={preview.missingAnimals.length} /></div>
        {preview.sessionIssues.length > 0 && <div className="notice notice-error mb-4"><strong>Corrija antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        {(preview.sessionWarnings?.length ?? 0) > 0 && <div className="notice notice-warning mb-4"><strong>Confira antes de salvar</strong><ul className="mt-1 list-disc pl-5">{preview.sessionWarnings?.map((issue) => <li key={issue}>{issue}</li>)}</ul>{preview.missingAnimals.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Ver vacas sem medição vinculada</summary><p className="text-xs">{preview.missingAnimals.map((animal) => animal.name || `Brinco ${animal.tagNumber}`).join(', ')}.</p></details>}<p className="mt-2 text-xs">Isso não impede salvar: o controle individual pode ser pontual e não registra ausência nem produção zero.</p></div>}
        <FilterBar><Field label="Buscar animal"><Input type="search" value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} placeholder="Nome, brinco ou original" /></Field><Field label="Mostrar"><Select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}><option value="ISSUES">Inconsistências primeiro</option><option value="ALL">Todas</option><option value="NEEDS_REVIEW">Aguardando revisão</option><option value="CONFIRMED">Confirmadas</option><option value="EXCLUDED">Excluídas</option></Select></Field></FilterBar>
        <ScrollArea label="Linhas da revisão do controle" className="mt-4 max-h-[46rem]">{visibleRows.map(({ row, index }) => <div className={`review-row ${row.status === 'NEEDS_REVIEW' ? 'review-row-warning' : ''}`} key={`${row.rawAnimalLabel}-${index}`}>
          <div className="mb-3 flex items-start justify-between gap-3"><div><span className="text-xs font-semibold text-[var(--muted)]">Linha {index + 1}</span><strong className="block">{row.rawAnimalLabel}</strong><p className="text-xs text-[var(--muted)]">Original preservado{row.rawValueText ? ` · “${row.rawValueText}”` : ''}</p></div><Badge tone={row.status === 'CONFIRMED' ? 'success' : row.status === 'EXCLUDED' ? 'neutral' : 'warning'}>{row.status === 'CONFIRMED' ? 'Confirmado' : row.status === 'EXCLUDED' ? 'Excluído' : 'Revisar'}</Badge></div>
          {row.issues.length > 0 && <div className="notice notice-warning mb-3"><ul className="list-disc pl-5">{row.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Field label="Animal vinculado"><Select value={row.animalId || ''} onChange={(event) => update(index, { animalId: event.target.value || null })}><option value="">Sem vínculo</option>{animals?.map((animal) => <option key={animal.id} value={animal.id}>{animal.name || `Brinco ${animal.tagNumber}`}</option>)}</Select></Field><Field label="Manhã (L)"><ParsedDecimalInput suffix="L" value={row.morningLiters} onValueChange={(value) => updatePeriod(index, 'morningLiters', value)} /></Field><Field label="Tarde (L)"><ParsedDecimalInput suffix="L" value={row.afternoonLiters} onValueChange={(value) => updatePeriod(index, 'afternoonLiters', value)} /></Field><Field label="Total (L)" hint="Recalculado pela manhã e tarde" error={row.status !== 'EXCLUDED' && row.totalLiters === null ? 'Informe manhã ou tarde, ou mantenha a linha excluída.' : undefined}><ParsedDecimalInput suffix="L" value={row.totalLiters} onValueChange={() => undefined} readOnly aria-readonly /></Field><Field label="Situação"><Select value={row.status} onChange={(event) => update(index, { status: event.target.value })}><option value="CONFIRMED">Confirmado</option><option value="NEEDS_REVIEW">Aguardando revisão</option><option value="EXCLUDED">Excluído</option></Select></Field></div>
          {!row.animalId && row.status !== 'EXCLUDED' && <p className="mt-2 text-xs text-[var(--warning)]">Se for uma vaca nova, você poderá cadastrar e vincular várias de uma vez depois de salvar o controle.</p>}{row.notes && <p className="mt-2 text-xs text-[var(--muted)]">{row.notes}</p>}
        </div>)}</ScrollArea><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className={`text-xs ${invalidMeasurementCount ? 'font-semibold text-[var(--danger)]' : 'text-[var(--muted)]'}`}>{invalidMeasurementCount ? `${invalidMeasurementCount} linha(s) precisa(m) de um valor ou deve(m) permanecer excluída(s).` : 'Linhas “a revisar” ficam fora dos totais até serem confirmadas.'}</p><Button className="w-full sm:w-auto" disabled={busy || preview.sessionIssues.length > 0 || invalidMeasurementCount > 0} onClick={() => void confirm()}>{busy ? 'Importando…' : 'Salvar controle revisado'}</Button></div></SectionCard>}
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
  const [showEstimate, setShowEstimate] = useState(true);
  const [measurementSearch, setMeasurementSearch] = useState('');
  const [measurementStatus, setMeasurementStatus] = useState('ALL');
  const [measurementIssue, setMeasurementIssue] = useState('ALL');
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState(false);
  const [showBulkRegistration, setShowBulkRegistration] = useState(false);
  const [sessionDate, setSessionDate] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
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
  function startSessionEdit() {
    if (!data) return;
    setSessionDate(data.sessionDate); setSessionTitle(data.title ?? ''); setSessionNotes(data.notes ?? ''); setEditingSession(true);
  }
  async function saveSession() {
    setBusy(true); setActionError('');
    try { await api(`/api/milk-sessions/${id}`, json('PATCH', { sessionDate, title: sessionTitle.trim() || null, notes: sessionNotes.trim() || null })); setEditingSession(false); reload(); toast('Controle atualizado'); }
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
  const unmatched = data.measurements.filter((row) => !row.animalId && row.status !== 'EXCLUDED' && row.rawAnimalLabel !== '[rótulo ilegível]');
  const ordered = [...review, ...confirmed, ...data.measurements.filter((row) => row.status === 'EXCLUDED')];
  const filteredMeasurements = ordered.filter((row) => (measurementStatus === 'ALL' || row.status === measurementStatus)
    && (measurementIssue === 'ALL' || (measurementIssue === 'ISSUES' && row.issues.length > 0) || (measurementIssue === 'UNMATCHED' && !row.animalId) || (measurementIssue === 'LOW_CONFIDENCE' && row.confidence === 'LOW') || (measurementIssue === 'MISSING_PERIOD' && (row.morningLiters === null || row.afternoonLiters === null)))
    && `${row.animalName ?? ''} ${row.tagNumber ?? ''} ${row.rawAnimalLabel}`.toLocaleLowerCase('pt-BR').includes(measurementSearch.toLocaleLowerCase('pt-BR')));
  return <div className="page"><PageHeader icon={Milk} title={data.title || `Controle de ${formatDate(data.sessionDate)}`} subtitle={`${formatDate(data.sessionDate)} · ${data.source === 'NOTEBOOK_SEED' ? 'Transcrição inicial do caderno' : data.source === 'IMPORT' ? 'Importado' : 'Registro manual'}`} action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={startSessionEdit}>Editar</Button><ConfirmButton variant="danger" disabled={busy} question="Excluir este controle e suas medições? Esta ação não pode ser desfeita." onClick={() => void deleteSession()}>Excluir</ConfirmButton></div>} />
    <div className="grid gap-5">
      {actionError && <ErrorState message={actionError} />}
      {editingSession && <SectionCard title="Editar controle"><div className="grid gap-3 sm:grid-cols-2"><Field label="Data do controle"><Input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required /></Field><Field label="Título"><Input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} /></Field><Field label="Observação"><Textarea className="min-h-12" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} /></Field></div><p className="mt-2 text-xs text-[var(--muted)]">Corrigir a data mantém todas as medições e rótulos deste controle.</p><div className="mt-3 flex gap-2"><Button disabled={busy || !sessionDate} onClick={() => void saveSession()}>{busy ? 'Salvando…' : 'Salvar'}</Button><Button variant="secondary" onClick={() => setEditingSession(false)}>Cancelar</Button></div></SectionCard>}
      <div className="grid grid-cols-3 gap-3"><div className="stat-card"><span className="stat-label">Total confirmado</span><strong className="stat-value block">{formatLiters(total)}</strong></div><div className="stat-card"><span className="stat-label">Confirmados</span><strong className="stat-value block">{confirmed.length}</strong></div><div className="stat-card"><span className="stat-label">A revisar</span><strong className="stat-value block">{review.length}</strong></div></div>
      {data.notes && <div className="notice notice-info">{data.notes}</div>}{data.missingAnimals.length > 0 && <div className="notice notice-warning"><strong>{data.missingAnimals.length} vaca(s) em lactação sem medição vinculada</strong><p className="mt-1 text-xs">Isso é um aviso de conferência; não registra ausência nem produção zero.</p><details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Ver vacas sem medição</summary><p className="text-xs">{data.missingAnimals.map((animal) => animal.name || `Brinco ${animal.tagNumber}`).join(', ')}.</p></details></div>}
      <SectionCard title="Medições" action={<div className="flex flex-wrap items-center justify-end gap-2">{unmatched.length > 0 && <Button variant="secondary" onClick={() => setShowBulkRegistration((value) => !value)}><Plus size={17} aria-hidden />Cadastrar sem vínculo ({unmatched.length})</Button>}<label className="flex min-h-11 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={showEstimate} onChange={(event) => setShowEstimate(event.target.checked)} /> Mostrar estimativas</label></div>}>
        {showBulkRegistration && unmatched.length > 0 && <BulkRegisterAnimalsPanel sessionId={id} sessionDate={data.sessionDate} rows={unmatched} onCancel={() => setShowBulkRegistration(false)} onDone={async () => { setShowBulkRegistration(false); await Promise.all([reload(), reloadAnimals()]); }} />}
        <FilterBar><Field label="Buscar animal"><Input type="search" value={measurementSearch} onChange={(event) => setMeasurementSearch(event.target.value)} placeholder="Nome, brinco ou rótulo original" /></Field><Field label="Situação"><Select value={measurementStatus} onChange={(event) => setMeasurementStatus(event.target.value)}><option value="ALL">Todas</option><option value="CONFIRMED">Confirmadas</option><option value="NEEDS_REVIEW">Aguardando revisão</option><option value="EXCLUDED">Excluídas</option></Select></Field><Field label="Inconsistência"><Select value={measurementIssue} onChange={(event) => setMeasurementIssue(event.target.value)}><option value="ALL">Todas as linhas</option><option value="ISSUES">Com inconsistência</option><option value="UNMATCHED">Sem vínculo</option><option value="LOW_CONFIDENCE">Baixa confiança</option><option value="MISSING_PERIOD">Período ausente</option></Select></Field></FilterBar>
        {!filteredMeasurements.length ? <InlineEmpty className="mt-4">Nenhuma medição encontrada com estes filtros.</InlineEmpty> : <ScrollArea label="Medições do controle" className="mt-4">{filteredMeasurements.map((row) => <div className="border-b border-[var(--border)] py-4 last:border-b-0" key={row.id}><div className="flex items-start justify-between gap-3"><div><strong>{row.animalName || (row.tagNumber ? `Brinco ${row.tagNumber}` : row.rawAnimalLabel)}</strong><p className="text-xs text-[var(--muted)]">Original: {row.rawAnimalLabel}{row.rawValueText ? ` · “${row.rawValueText}”` : ''}</p></div><div className="text-right"><strong className="text-lg">{row.totalLiters === null ? 'Sem valor legível' : formatLiters(row.totalLiters)}</strong><div><StatusBadge descriptor={milkMeasurementStatusDescriptor[row.status]} /></div></div></div>
          {row.morningLiters !== null && row.afternoonLiters !== null && <p className="mt-2 text-sm">Manhã {formatLiters(row.morningLiters)} · Tarde {formatLiters(row.afternoonLiters)}</p>}
          {row.morningLiters !== null && row.afternoonLiters === null && <p className="mt-2 text-sm">Manhã {formatLiters(row.morningLiters)} · Tarde sem medição</p>}
          {showEstimate && row.estimate && <div className="notice notice-warning mt-2"><strong>Estimativa — não foi medido separadamente</strong><br />Manhã {formatLiters(row.estimate.morning)} · Tarde {formatLiters(row.estimate.afternoon)}<br /><span className="text-xs">Método: {row.estimate.description}</span></div>}
          {row.issues.length > 0 && <div className="notice notice-warning mt-2"><ul className="list-disc pl-5">{row.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}{row.notes && <p className="mt-2 text-sm text-[var(--muted)]">{row.notes}</p>}
          {editingMeasurementId === row.id ? <MilkMeasurementEditor measurement={row} animals={animals ?? []} busy={busy} onSave={(value) => void saveMeasurement(row.id, value)} onCancel={() => setEditingMeasurementId(null)} /> : <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setEditingMeasurementId(row.id)}>Corrigir</Button>{row.status !== 'CONFIRMED' && row.totalLiters !== null && <Button aria-label={`Confirmar linha ${row.rawAnimalLabel} ${row.rawValueText ?? row.totalLiters}`} onClick={() => void setStatus(row, 'CONFIRMED')}>Confirmar</Button>}{row.status !== 'NEEDS_REVIEW' && row.totalLiters !== null && <Button variant="secondary" onClick={() => void setStatus(row, 'NEEDS_REVIEW')}>Revisar</Button>}{row.status !== 'EXCLUDED' && <Button variant="danger" onClick={() => void excludeMeasurement(row)}>Excluir dos totais</Button>}</div>}
        </div>)}</ScrollArea>}
      </SectionCard>
      <SectionCard title="Documentos do controle"><AttachmentPanel attachments={data.attachments} milkSessionId={id} onChange={reload} /></SectionCard>
    </div>
  </div>;
}
