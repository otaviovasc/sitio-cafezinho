import { useMemo, useState } from 'react';
import { Scale, Search } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate } from '../../domain/format';
import { formatWeight } from '../../domain/weight';
import { GUARDRAILS, rangeError } from '../../domain/guardrails';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { useToast } from '../components/feedback-context';
import { ConfirmButton } from '../components/feedback';
import { ParsedDecimalInput } from '../components/form-controls';
import { Badge, Button, EmptyState, ErrorState, Field, InlineEmpty, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatCard, StatusBadge, SubmitBar } from '../components/ui';
import { FilterControls } from '../components/FilterControls';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, json } from '../lib/api';
import { animalStatusLabels, today } from '../lib/labels';
import { weightMeasurementStatusDescriptor } from '../lib/status';

type Animal = { id: string; name: string | null; tagNumber: string | null; status: string };
type WeightSessionSummary = { id: string; measuredOn: string; title: string | null; source: string; notes: string | null; confirmedCount: number; reviewCount: number; averageWeight: string };
type WeightRow = {
  id?: string;
  animalId: string | null;
  animalName?: string | null;
  tagNumber?: string | null;
  rawAnimalLabel: string;
  rawValueText?: string | null;
  weightKg: number | string | null;
  confidence: string;
  status: string;
  notes?: string | null;
  issues?: string[];
  matchedAnimal?: Animal | null;
  previousWeight?: { weightKg: string; measuredAt: string } | null;
};
type WeightSessionDetail = { id: string; measuredOn: string; title: string | null; source: string; notes: string | null; measurements: WeightRow[] };

function animalLabel(animal: Animal) { return animal.name || `Brinco ${animal.tagNumber}`; }

export function WeightSessionsPage() {
  const { data = [], loading, error, reload } = useResource<WeightSessionSummary[]>('/api/weight-sessions');
  const [search, setSearch] = useState('');
  const filtered = (data ?? []).filter((row) => `${row.title ?? ''} ${formatDate(row.measuredOn)}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const latest = data?.[0];
  const totalReview = (data ?? []).reduce((sum, row) => sum + row.reviewCount, 0);
  const chartData = [...(data ?? [])].reverse().map((row) => ({ date: row.measuredOn, average: row.averageWeight }));
  return <div className="page">
    <PageHeader icon={Scale} title="Peso" subtitle="Pesagens reais, parciais e revisadas antes de entrar no histórico" action={<Link className="button button-primary" to="/pesos/novo"><Scale size={18} aria-hidden />Nova pesagem</Link>} />
    {loading ? <SkeletonList rows={5} /> : error ? <ErrorState message={error} retry={reload} /> : <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Última pesagem" value={latest ? formatDate(latest.measuredOn) : '—'} />
        <StatCard label="Animais pesados" value={latest?.confirmedCount ?? 0} detail="Na última sessão" />
        <StatCard label="Peso médio" value={latest ? formatWeight(latest.averageWeight) : '—'} detail="Somente confirmados" />
        <StatCard label="Aguardando revisão" value={totalReview} detail="Fora dos indicadores" />
      </div>
      <SectionCard title="Evolução do peso médio" icon={Scale}>
        <p className="mb-3 text-xs text-[var(--muted)]">Cada ponto usa somente os animais confirmados naquela pesagem. Como as sessões podem ser parciais, compare também o histórico individual.</p>
        <TimeSeriesChart data={chartData} series={[{ key: 'average', label: 'Peso médio', color: '#315c3b', area: true }]} valueSuffix="kg" startAtZero={false} label="Evolução do peso médio nas sessões" />
      </SectionCard>
      <SectionCard title="Sessões de pesagem">
        <FilterControls search={{ label: 'Buscar sessão', value: search, onChange: setSearch, placeholder: 'Data ou título' }} />
        {!filtered.length ? <EmptyState title="Nenhuma pesagem" description="Registre uma pesagem, mesmo parcial: só os animais realmente pesados." action={<Link className="button button-primary" to="/pesos/novo">Registrar pesagem</Link>} /> : <ScrollArea label="Sessões de pesagem" className="mt-3">{filtered.map((session) => <Link className="mobile-item" to={`/pesos/${session.id}`} key={session.id}><span className="min-w-0"><strong className="block truncate">{session.title || `Pesagem de ${formatDate(session.measuredOn)}`}</strong><span className="text-sm text-[var(--muted)]">{formatDate(session.measuredOn)} · {session.confirmedCount} confirmada(s)</span></span><span className="text-right"><strong>{formatWeight(session.averageWeight)}</strong>{session.reviewCount > 0 && <Badge tone="warning">{session.reviewCount} revisar</Badge>}</span></Link>)}</ScrollArea>}
      </SectionCard>
    </div>}
  </div>;
}

/**
 * Pesagem manual, sem chave/IA: uma sessão pode ser parcial — registre apenas os
 * animais realmente pesados. GUARDRAILS barra pesos claramente impossíveis.
 */
export function NewWeightSessionPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const [date, setDate] = useState(today());
  const [search, setSearch] = useState('');
  const [weights, setWeights] = useState<Record<string, number | null>>({});
  const [formError, setFormError] = useState('');
  const { data: animals = [], loading, error: animalsError, reload } = useResource<Animal[]>('/api/animals');
  const active = (animals ?? []).filter((animal) => !['SOLD', 'DEAD'].includes(animal.status));
  const entered = active.filter((animal) => (weights[animal.id] ?? null) !== null);
  const dirty = entered.length > 0;
  useUnsavedGuard(dirty);
  const filtered = active.filter((animal) => `${animal.name ?? ''} ${animal.tagNumber ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));

  function submit() {
    if (!entered.length) { setFormError('Informe o peso de ao menos um animal pesado.'); return; }
    for (const animal of entered) {
      const problem = rangeError(weights[animal.id] as number, GUARDRAILS.weightKg, ' kg');
      if (problem) { setFormError(`${animalLabel(animal)}: ${problem}`); return; }
    }
    setFormError('');
    void run(async () => {
      const session = await api<{ id: string }>('/api/weight-sessions', json('POST', {
        measuredOn: date,
        title: 'Pesagem do rebanho',
        measurements: entered.map((animal) => ({ animalId: animal.id, rawAnimalLabel: animalLabel(animal), weightKg: weights[animal.id], confidence: 'HIGH', status: 'CONFIRMED', notes: null })),
      }));
      toast('Pesagem registrada');
      navigate(`/pesos/${session.id}`, { replace: true });
    });
  }

  return <div className="page"><div className="page-narrow">
    <PageHeader icon={Scale} title="Nova pesagem" subtitle="Pode ser parcial: registre somente os animais realmente pesados" />
    <div className="grid gap-5">
      {error && <ErrorState message={error} />}
      {formError && <ErrorState message={formError} />}
      <SectionCard><div className="grid gap-3 sm:grid-cols-2"><Field label="Data da pesagem"><Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Buscar animal"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou brinco" /></Field></div></SectionCard>
      {loading ? <SkeletonList rows={6} /> : animalsError ? <ErrorState message={animalsError} retry={reload} /> : !active.length
        ? <EmptyState title="Nenhum animal no rebanho" description="Cadastre animais para registrar pesagens." action={<Link className="button button-primary" to="/rebanho/novo">Cadastrar animal</Link>} />
        : <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}><SectionCard title={`Animais no rebanho · ${active.length}`} action={<span className="text-xs text-[var(--muted)]">{entered.length} pesado(s)</span>}>
          {!filtered.length ? <InlineEmpty className="mt-2">Nenhum animal encontrado com esta busca.</InlineEmpty> : <ScrollArea label="Animais para pesagem" className="max-h-[46rem]">{filtered.map((animal) => <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-3 last:border-b-0" key={animal.id}><div className="min-w-0"><strong className="block truncate">{animalLabel(animal)}</strong><span className="text-xs text-[var(--muted)]">{animalStatusLabels[animal.status]}</span></div><div className="w-36 shrink-0"><ParsedDecimalInput aria-label={`Peso de ${animalLabel(animal)}`} suffix="kg" value={weights[animal.id] ?? null} onValueChange={(value) => setWeights((current) => ({ ...current, [animal.id]: value }))} /></div></div>)}</ScrollArea>}
          <div className="mt-4"><SubmitBar label={`Salvar pesagem${entered.length ? ` · ${entered.length}` : ''}`} busy={busy} disabled={!entered.length} secondary={<Button type="button" variant="secondary" onClick={() => navigate('/pesos')}>Cancelar</Button>} /></div>
        </SectionCard></form>}
    </div>
  </div></div>;
}

export function WeightSessionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useResource<WeightSessionDetail>(`/api/weight-sessions/${id}`);
  const { data: animals = [] } = useResource<Animal[]>('/api/animals');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<WeightRow | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const visible = useMemo(() => (data?.measurements ?? []).filter((row) => (filter === 'ALL' || row.status === filter) && `${row.animalName ?? ''} ${row.tagNumber ?? ''} ${row.rawAnimalLabel}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [data, filter, search]);
  async function save() {
    if (!editing || !draft) return;
    setBusy(true); setActionError('');
    try { await api(`/api/weight-measurements/${editing}`, json('PATCH', { animalId: draft.animalId, weightKg: draft.weightKg, confidence: draft.confidence, status: draft.status, notes: draft.notes ?? null })); setEditing(null); setDraft(null); await reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível corrigir a pesagem.'); }
    finally { setBusy(false); }
  }
  async function remove() { setBusy(true); try { await api(`/api/weight-sessions/${id}`, { method: 'DELETE' }); navigate('/pesos', { replace: true }); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir.'); setBusy(false); } }
  if (loading) return <div className="page"><SkeletonList rows={5} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Pesagem não encontrada.'} retry={reload} /></div>;
  const confirmedRows = data.measurements.filter((row) => row.status === 'CONFIRMED' && row.weightKg !== null);
  const average = confirmedRows.length ? confirmedRows.reduce((sum, row) => sum + Number(row.weightKg), 0) / confirmedRows.length : 0;
  return <div className="page"><PageHeader icon={Scale} title={data.title || 'Pesagem do rebanho'} subtitle={`${formatDate(data.measuredOn)} · ${data.source === 'DEMO_SEED' ? 'Dados demonstrativos' : data.source === 'IMPORT' ? 'Importada' : 'Registro manual'}`} action={<ConfirmButton variant="danger" question="Excluir esta sessão e todas as suas linhas?" disabled={busy} onClick={() => void remove()}>Excluir</ConfirmButton>} />
    <div className="grid gap-5">{actionError && <ErrorState message={actionError} />}<div className="grid grid-cols-3 gap-3"><StatCard label="Confirmadas" value={confirmedRows.length} /><StatCard label="Peso médio" value={formatWeight(average)} /><StatCard label="A revisar" value={data.measurements.filter((row) => row.status === 'NEEDS_REVIEW').length} /></div>
      <SectionCard title="Revisão da sessão" icon={Search}><FilterControls search={{ value: search, onChange: setSearch, placeholder: 'Nome, brinco ou original' }} selects={[{ label: 'Situação', value: filter, onChange: setFilter, options: [{ value: 'ALL', label: 'Todas' }, { value: 'NEEDS_REVIEW', label: 'A revisar' }, { value: 'CONFIRMED', label: 'Confirmadas' }, { value: 'EXCLUDED', label: 'Excluídas' }] }] } />
        <ScrollArea label="Linhas da sessão de pesagem" className="mt-4">{visible.map((row) => <div className="review-row" key={row.id}><div className="flex items-start justify-between gap-3"><div><strong>{row.animalName || (row.tagNumber ? `Brinco ${row.tagNumber}` : row.rawAnimalLabel)}</strong><p className="text-xs text-[var(--muted)]">Original: {row.rawAnimalLabel}</p></div><div className="text-right"><strong>{row.weightKg === null ? 'Sem peso' : formatWeight(row.weightKg)}</strong><div><StatusBadge descriptor={weightMeasurementStatusDescriptor[row.status]} /></div></div></div>
          {editing === row.id && draft ? <div className="mt-3 grid gap-3 md:grid-cols-3"><Field label="Animal"><Select value={draft.animalId || ''} onChange={(event) => setDraft({ ...draft, animalId: event.target.value || null })}><option value="">Sem vínculo</option>{(animals ?? []).map((animal) => <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>)}</Select></Field><Field label="Peso (kg)"><ParsedDecimalInput suffix="kg" value={draft.weightKg} onValueChange={(value) => setDraft({ ...draft, weightKg: value })} /></Field><Field label="Situação"><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="CONFIRMED">Confirmada</option><option value="NEEDS_REVIEW">A revisar</option><option value="EXCLUDED">Excluída</option></Select></Field><div className="flex gap-2 md:col-span-3"><Button disabled={busy} onClick={() => void save()}>Salvar correção</Button><Button variant="secondary" onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</Button></div></div> : <Button className="mt-3" variant="secondary" onClick={() => { setEditing(row.id ?? null); setDraft(row); }}>Corrigir</Button>}
        </div>)}</ScrollArea>
      </SectionCard>
    </div>
  </div>;
}
