import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Scale, Search } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate } from '../../domain/format';
import { formatWeight } from '../../domain/weight';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { useToast } from '../components/feedback-context';
import { ConfirmButton } from '../components/feedback';
import { ParsedDecimalInput } from '../components/form-controls';
import { Badge, Button, EmptyState, ErrorState, Field, FilterBar, Input, LoadingState, PageHeader, ScrollArea, SectionCard, Select, StatCard, Textarea } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { animalStatusLabels, today } from '../lib/labels';

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
type WeightPreview = { measuredOn: string; measurements: WeightRow[] };
type WeightSessionDetail = { id: string; measuredOn: string; title: string | null; source: string; notes: string | null; measurements: WeightRow[] };

const WEIGHT_PROMPT = `Você está transcrevendo pesagens reais de um rebanho leiteiro a partir de fotos ou anotações.

A data da pesagem é: {{MEASURED_ON}}.

Regras:
- Preserve o nome ou número do animal exatamente como aparece.
- Não corrija nomes, não invente animais e não invente pesos.
- O peso deve estar em quilogramas e usar ponto decimal no JSON.
- Se estiver ilegível, use weightKg null e confidence LOW.
- Se a linha estiver riscada, use excluded true.
- Dúvidas devem ficar em notes e reduzir a confiança.
- Retorne somente JSON válido, sem bloco Markdown.

Formato obrigatório:
{
  "measuredOn": "{{MEASURED_ON}}",
  "measurements": [
    {
      "rawAnimalLabel": "Caruja",
      "rawValueText": "486",
      "weightKg": 486.0,
      "confidence": "HIGH",
      "excluded": false,
      "notes": null
    }
  ]
}`;

function weightExample(date: string) {
  return JSON.stringify({ measuredOn: date, measurements: [
    { rawAnimalLabel: 'Caruja', rawValueText: '486', weightKg: 486, confidence: 'HIGH', excluded: false, notes: null },
    { rawAnimalLabel: '141', rawValueText: '430?', weightKg: 430, confidence: 'LOW', excluded: false, notes: 'Último dígito duvidoso' },
  ] }, null, 2);
}

function animalLabel(animal: Animal) { return animal.name || `Brinco ${animal.tagNumber}`; }
function statusLabel(status: string) { return status === 'CONFIRMED' ? 'Confirmada' : status === 'NEEDS_REVIEW' ? 'Revisar' : 'Excluída'; }
function statusTone(status: string): 'success' | 'warning' | 'neutral' { return status === 'CONFIRMED' ? 'success' : status === 'NEEDS_REVIEW' ? 'warning' : 'neutral'; }

export function WeightSessionsPage() {
  const { data = [], loading, error, reload } = useResource<WeightSessionSummary[]>('/api/weight-sessions');
  const [search, setSearch] = useState('');
  const filtered = (data ?? []).filter((row) => `${row.title ?? ''} ${formatDate(row.measuredOn)}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const latest = data?.[0];
  const totalReview = (data ?? []).reduce((sum, row) => sum + row.reviewCount, 0);
  const chartData = [...(data ?? [])].reverse().map((row) => ({ date: row.measuredOn, average: row.averageWeight }));
  return <div className="page">
    <PageHeader icon={Scale} title="Peso" subtitle="Pesagens reais, parciais e revisadas antes de entrar no histórico" action={<Link className="button button-primary" to="/pesos/importar"><Scale size={18} aria-hidden />Nova pesagem</Link>} />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : <div className="grid gap-5">
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
        <FilterBar><Field label="Buscar sessão"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Data ou título" /></Field></FilterBar>
        {!filtered.length ? <EmptyState title="Nenhuma pesagem" description="Importe uma pesagem parcial ou completa usando o prompt do ChatGPT." action={<Link className="button button-primary" to="/pesos/importar">Registrar pesagem</Link>} /> : <ScrollArea label="Sessões de pesagem" className="mt-3">{filtered.map((session) => <Link className="mobile-item" to={`/pesos/${session.id}`} key={session.id}><span className="min-w-0"><strong className="block truncate">{session.title || `Pesagem de ${formatDate(session.measuredOn)}`}</strong><span className="text-sm text-[var(--muted)]">{formatDate(session.measuredOn)} · {session.confirmedCount} confirmada(s)</span></span><span className="text-right"><strong>{formatWeight(session.averageWeight)}</strong>{session.reviewCount > 0 && <Badge tone="warning">{session.reviewCount} revisar</Badge>}</span></Link>)}</ScrollArea>}
      </SectionCard>
    </div>}
  </div>;
}

function WeightReview({ rows, setRows, animals, busy, onConfirm }: { rows: WeightRow[]; setRows: (rows: WeightRow[]) => void; animals: Animal[]; busy: boolean; onConfirm: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ISSUES');
  function update(index: number, values: Partial<WeightRow>) { setRows(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row)); }
  const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
    const matchesSearch = `${row.rawAnimalLabel} ${row.matchedAnimal?.name ?? ''} ${row.matchedAnimal?.tagNumber ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
    const matchesFilter = filter === 'ALL' || (filter === 'ISSUES' && (row.status === 'NEEDS_REVIEW' || (row.issues?.length ?? 0) > 0)) || row.status === filter;
    return matchesSearch && matchesFilter;
  });
  const confirmed = rows.filter((row) => row.status === 'CONFIRMED').length;
  const review = rows.filter((row) => row.status === 'NEEDS_REVIEW').length;
  const unmatched = rows.filter((row) => !row.animalId).length;
  return <SectionCard title="3. Revisar antes de salvar" icon={ClipboardCheck}>
    <div className="mb-4 grid grid-cols-3 gap-3"><StatCard label="Confirmadas" value={confirmed} /><StatCard label="Revisar" value={review} /><StatCard label="Sem vínculo" value={unmatched} /></div>
    <FilterBar>
      <Field label="Buscar animal"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, brinco ou original" /></Field>
      <Field label="Mostrar"><Select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ISSUES">Inconsistências primeiro</option><option value="ALL">Todas</option><option value="CONFIRMED">Confirmadas</option><option value="NEEDS_REVIEW">Aguardando revisão</option><option value="EXCLUDED">Excluídas</option></Select></Field>
    </FilterBar>
    {!visible.length ? <p className="mt-4 text-sm text-[var(--muted)]">Nenhuma linha encontrada com estes filtros.</p> : <ScrollArea label="Revisão das pesagens" className="mt-4 max-h-[42rem]">{visible.map(({ row, index }) => <div className={`review-row ${row.status === 'NEEDS_REVIEW' ? 'review-row-warning' : ''}`} key={`${row.rawAnimalLabel}-${index}`}>
      <div className="flex items-start justify-between gap-3"><div><strong>{row.rawAnimalLabel}</strong><p className="text-xs text-[var(--muted)]">Original preservado{row.rawValueText ? ` · “${row.rawValueText}”` : ''}</p></div><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></div>
      {(row.issues?.length ?? 0) > 0 && <div className="notice notice-warning mt-3"><div className="flex gap-2"><AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden /><ul className="list-disc pl-4">{row.issues?.map((issue) => <li key={issue}>{issue}</li>)}</ul></div></div>}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Animal vinculado"><Select value={row.animalId || ''} onChange={(event) => update(index, { animalId: event.target.value || null })}><option value="">Sem vínculo</option>{animals.map((animal) => <option key={animal.id} value={animal.id}>{animalLabel(animal)} · {animalStatusLabels[animal.status]}</option>)}</Select></Field>
        <Field label="Peso (kg)"><ParsedDecimalInput suffix="kg" value={row.weightKg} onValueChange={(value) => update(index, { weightKg: value })} /></Field>
        <Field label="Situação da linha"><Select value={row.status} onChange={(event) => update(index, { status: event.target.value })}><option value="CONFIRMED">Confirmada</option><option value="NEEDS_REVIEW">Aguardando revisão</option><option value="EXCLUDED">Excluída</option></Select></Field>
      </div>
      {row.previousWeight && <p className="mt-2 text-xs text-[var(--muted)]">Última pesagem confirmada: {formatWeight(row.previousWeight.weightKg)} em {new Date(row.previousWeight.measuredAt).toLocaleDateString('pt-BR')}.</p>}
      {row.notes && <p className="mt-2 text-sm text-[var(--muted)]">{row.notes}</p>}
    </div>)}</ScrollArea>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--muted)]">Linhas em revisão ficam salvas, mas não entram em médias nem no histórico confirmado.</p><Button disabled={busy || rows.length === 0} onClick={onConfirm}>{busy ? 'Salvando…' : `Salvar ${rows.length} linha(s)`}</Button></div>
  </SectionCard>;
}

export function ImportWeightsPage() {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<WeightPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: animals = [] } = useResource<Animal[]>('/api/animals');
  const navigate = useNavigate();
  const prompt = WEIGHT_PROMPT.replaceAll('{{MEASURED_ON}}', date);
  async function copyPrompt() { try { await navigator.clipboard.writeText(prompt); toast('Prompt copiado'); } catch { setError('Não foi possível copiar automaticamente.'); } }
  async function validateRows() {
    setBusy(true); setError('');
    try { const result = await api<WeightPreview>('/api/weight-sessions/validate', json('POST', { content })); setPreview(result); setDate(result.measuredOn); toast('Dados carregados. Corrija as inconsistências destacadas.'); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Não foi possível validar.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const session = await api<{ id: string }>('/api/weight-sessions', json('POST', { measuredOn: preview.measuredOn, title: 'Pesagem do rebanho', measurements: preview.measurements.map((row) => ({ animalId: row.animalId, rawAnimalLabel: row.rawAnimalLabel, rawValueText: row.rawValueText, weightKg: row.weightKg, confidence: row.confidence, status: row.status, notes: row.notes })) }));
      toast('Pesagem registrada');
      navigate(`/pesos/${session.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a pesagem.'); }
    finally { setBusy(false); }
  }
  return <div className="page"><PageHeader icon={Scale} title="Nova pesagem" subtitle="Pode ser parcial: registre somente os animais realmente pesados" />
    <div className="grid gap-5">
      {error && <ErrorState message={error} />}
      <SectionCard title="1. Preparar o prompt" action={<Button variant="secondary" onClick={() => void copyPrompt()}>Copiar prompt</Button>}><Field label="Data da pesagem"><Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPreview(null); }} /></Field><details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Ver prompt completo</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-[#f0efe8] p-3 text-xs leading-5">{prompt}</pre></details></SectionCard>
      <SectionCard title="2. Colar e validar"><Field label="JSON retornado pelo ChatGPT"><Textarea className="min-h-64 font-mono text-sm" value={content} onChange={(event) => { setContent(event.target.value); setPreview(null); }} /></Field><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setContent(weightExample(date))}>Carregar exemplo</Button><Button disabled={busy || !content.trim()} onClick={() => void validateRows()}>{busy ? 'Validando…' : 'Validar pesagens'}</Button></div></SectionCard>
      {preview && <WeightReview rows={preview.measurements} setRows={(measurements) => setPreview({ ...preview, measurements })} animals={animals ?? []} busy={busy} onConfirm={() => void confirm()} />}
    </div>
  </div>;
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
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Pesagem não encontrada.'} retry={reload} /></div>;
  const confirmedRows = data.measurements.filter((row) => row.status === 'CONFIRMED' && row.weightKg !== null);
  const average = confirmedRows.length ? confirmedRows.reduce((sum, row) => sum + Number(row.weightKg), 0) / confirmedRows.length : 0;
  return <div className="page"><PageHeader icon={Scale} title={data.title || 'Pesagem do rebanho'} subtitle={`${formatDate(data.measuredOn)} · ${data.source === 'DEMO_SEED' ? 'Dados demonstrativos' : data.source === 'CHATGPT_IMPORT' ? 'Importada do ChatGPT' : 'Registro manual'}`} action={<ConfirmButton variant="danger" question="Excluir esta sessão e todas as suas linhas?" disabled={busy} onClick={() => void remove()}>Excluir</ConfirmButton>} />
    <div className="grid gap-5">{actionError && <ErrorState message={actionError} />}<div className="grid grid-cols-3 gap-3"><StatCard label="Confirmadas" value={confirmedRows.length} /><StatCard label="Peso médio" value={formatWeight(average)} /><StatCard label="A revisar" value={data.measurements.filter((row) => row.status === 'NEEDS_REVIEW').length} /></div>
      <SectionCard title="Revisão da sessão" icon={Search}><FilterBar><Field label="Buscar"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, brinco ou original" /></Field><Field label="Situação"><Select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Todas</option><option value="NEEDS_REVIEW">A revisar</option><option value="CONFIRMED">Confirmadas</option><option value="EXCLUDED">Excluídas</option></Select></Field></FilterBar>
        <ScrollArea label="Linhas da sessão de pesagem" className="mt-4">{visible.map((row) => <div className="review-row" key={row.id}><div className="flex items-start justify-between gap-3"><div><strong>{row.animalName || (row.tagNumber ? `Brinco ${row.tagNumber}` : row.rawAnimalLabel)}</strong><p className="text-xs text-[var(--muted)]">Original: {row.rawAnimalLabel}</p></div><div className="text-right"><strong>{row.weightKg === null ? 'Sem peso' : formatWeight(row.weightKg)}</strong><div><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></div></div></div>
          {editing === row.id && draft ? <div className="mt-3 grid gap-3 md:grid-cols-3"><Field label="Animal"><Select value={draft.animalId || ''} onChange={(event) => setDraft({ ...draft, animalId: event.target.value || null })}><option value="">Sem vínculo</option>{(animals ?? []).map((animal) => <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>)}</Select></Field><Field label="Peso (kg)"><ParsedDecimalInput suffix="kg" value={draft.weightKg} onValueChange={(value) => setDraft({ ...draft, weightKg: value })} /></Field><Field label="Situação"><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="CONFIRMED">Confirmada</option><option value="NEEDS_REVIEW">A revisar</option><option value="EXCLUDED">Excluída</option></Select></Field><div className="flex gap-2 md:col-span-3"><Button disabled={busy} onClick={() => void save()}>Salvar correção</Button><Button variant="secondary" onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</Button></div></div> : <Button className="mt-3" variant="secondary" onClick={() => { setEditing(row.id ?? null); setDraft(row); }}>Corrigir</Button>}
        </div>)}</ScrollArea>
      </SectionCard>
    </div>
  </div>;
}
