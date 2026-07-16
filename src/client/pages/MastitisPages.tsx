import { FormEvent, useState } from 'react';
import { Activity, Check, Plus } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDate } from '../../domain/format';
import { Badge, Button, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, ScrollArea, SectionCard, Select, Textarea } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { today } from '../lib/labels';

const statusLabels: Record<string, string> = {
  OBSERVATION: 'Em observação', IN_TREATMENT: 'Em tratamento', WITHDRAWAL_PERIOD: 'Em carência', RESOLVED: 'Resolvido',
  RECURRENT: 'Recorrente', NO_IMPROVEMENT: 'Sem melhora', CANCELLED: 'Cancelado',
};
const quarterLabels: Record<string, string> = { FRONT_LEFT: 'Dianteiro esquerdo', FRONT_RIGHT: 'Dianteiro direito', REAR_LEFT: 'Traseiro esquerdo', REAR_RIGHT: 'Traseiro direito', MULTIPLE: 'Mais de um teto', UNKNOWN: 'Não identificado' };
const detectionLabels: Record<string, string> = { VISUAL: 'Observação visual', BLACK_PLATE: 'Caneca de fundo preto', CMT: 'CMT', VETERINARY: 'Avaliação veterinária', OTHER: 'Outro', UNKNOWN: 'Não identificado' };
const outcomeLabels: Record<string, string> = { RESOLVED: 'Resolvido', IMPROVED: 'Melhorou', RECURRENT: 'Recorrente', NO_IMPROVEMENT: 'Sem melhora', ANIMAL_CULLED: 'Animal descartado', UNKNOWN: 'Não informado' };
const timingLabels: Record<string, string> = { TODAY: 'Hoje', OVERDUE: 'Atrasada', UPCOMING: 'Programada', COMPLETED: 'Realizada', CANCELLED: 'Cancelada' };

type Animal = { id: string; name: string | null; tagNumber: string | null };
type Withdrawal = { days: number; state: 'ACTIVE' | 'ENDS_TODAY' | 'PAST_DUE' } | null;
type MastitisAction = { id: string; scheduledFor: string; actionDescription: string; completedAt: string | null; completionNotes: string | null; cancelledAt: string | null; timing: string };
type MastitisCase = {
  id: string; animalId: string; animalName: string | null; tagNumber: string | null; detectedAt: string; affectedQuarter: string | null;
  detectionMethod: string | null; observedSigns: string | null; status: string; treatmentSummary: string | null; treatmentStartedAt: string | null;
  treatmentExpectedEndAt: string | null; withdrawalEndsAt: string | null; milkDiscardRequired: boolean; outcome: string | null; notes: string | null;
  resolvedAt: string | null; withdrawal: Withdrawal; nextAction?: MastitisAction | null;
};
type MastitisCaseDetail = MastitisCase & { actions: MastitisAction[] };

function animalName(animal: { name?: string | null; animalName?: string | null; tagNumber: string | null }) { return animal.name || animal.animalName || `Brinco ${animal.tagNumber}`; }
function dateFromTimestamp(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : ''; }
function noonIso(value: string) { return new Date(`${value}T12:00:00-03:00`).toISOString(); }
function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'RESOLVED') return 'success';
  if (status === 'NO_IMPROVEMENT' || status === 'RECURRENT') return 'danger';
  if (status === 'CANCELLED') return 'neutral';
  return 'warning';
}

function WithdrawalNotice({ withdrawalEndsAt, withdrawal }: { withdrawalEndsAt: string | null; withdrawal: Withdrawal }) {
  if (!withdrawalEndsAt || !withdrawal) return null;
  const detail = withdrawal.state === 'ACTIVE' ? `${withdrawal.days} dia(s) restante(s)` : withdrawal.state === 'ENDS_TODAY' ? 'A data informada termina hoje' : `Data informada passou há ${Math.abs(withdrawal.days)} dia(s)`;
  return <div className={`notice ${withdrawal.state === 'PAST_DUE' ? 'notice-error' : 'notice-warning'}`}><strong>Carência informada até {formatDate(withdrawalEndsAt)}</strong><br />{detail}<br /><span className="text-xs">Confirme o encerramento antes de voltar a utilizar o leite normalmente.</span></div>;
}

function MastitisCaseForm({ initial, initialAnimalId, onSaved }: { initial?: MastitisCaseDetail; initialAnimalId?: string; onSaved: (item: MastitisCase) => void }) {
  const { data: animals, loading: loadingAnimals, error: animalError } = useResource<Animal[]>('/api/animals');
  const [animalId, setAnimalId] = useState(initial?.animalId ?? initialAnimalId ?? '');
  const [detectedOn, setDetectedOn] = useState(dateFromTimestamp(initial?.detectedAt) || today());
  const [status, setStatus] = useState(initial?.status ?? 'OBSERVATION');
  const [observedSigns, setObservedSigns] = useState(initial?.observedSigns ?? '');
  const [affectedQuarter, setAffectedQuarter] = useState(initial?.affectedQuarter ?? '');
  const [detectionMethod, setDetectionMethod] = useState(initial?.detectionMethod ?? '');
  const [treatmentSummary, setTreatmentSummary] = useState(initial?.treatmentSummary ?? '');
  const [treatmentStartedOn, setTreatmentStartedOn] = useState(dateFromTimestamp(initial?.treatmentStartedAt));
  const [treatmentExpectedEndOn, setTreatmentExpectedEndOn] = useState(dateFromTimestamp(initial?.treatmentExpectedEndAt));
  const [withdrawalEndsAt, setWithdrawalEndsAt] = useState(initial?.withdrawalEndsAt ?? '');
  const [milkDiscardRequired, setMilkDiscardRequired] = useState(initial?.milkDiscardRequired ?? false);
  const [outcome, setOutcome] = useState(initial?.outcome ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!animalId) { setError('Escolha o animal.'); return; }
    if (!observedSigns.trim() && !notes.trim()) { setError('Informe o sinal percebido ou uma observação.'); return; }
    setBusy(true);
    try {
      const body = {
        animalId, detectedAt: noonIso(detectedOn), status, observedSigns: observedSigns.trim() || null,
        affectedQuarter: affectedQuarter || null, detectionMethod: detectionMethod || null,
        treatmentSummary: treatmentSummary.trim() || null, treatmentStartedAt: treatmentStartedOn ? noonIso(treatmentStartedOn) : null,
        treatmentExpectedEndAt: treatmentExpectedEndOn ? noonIso(treatmentExpectedEndOn) : null, withdrawalEndsAt: withdrawalEndsAt || null,
        milkDiscardRequired, outcome: outcome || null, notes: notes.trim() || null, resolvedAt: initial?.resolvedAt ?? null,
      };
      const saved = await api<MastitisCase>(initial ? `/api/mastitis-cases/${initial.id}` : '/api/mastitis-cases', json(initial ? 'PATCH' : 'POST', body));
      onSaved(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o caso.'); }
    finally { setBusy(false); }
  }

  return <form className="grid gap-4" onSubmit={(event) => void save(event)}>{(error || animalError) && <ErrorState message={error || animalError} />}
    <SectionCard title="Registro rápido"><div className="grid gap-3 sm:grid-cols-2"><Field label="Animal"><Select value={animalId} onChange={(event) => setAnimalId(event.target.value)} disabled={loadingAnimals} required><option value="">Selecione</option>{animals?.map((animal) => <option key={animal.id} value={animal.id}>{animalName(animal)}</option>)}</Select></Field><Field label="Data"><Input type="date" value={detectedOn} onChange={(event) => setDetectedOn(event.target.value)} required /></Field><Field label="Status inicial"><Select value={status} onChange={(event) => setStatus(event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Sinal percebido ou observação"><Textarea className="min-h-20" value={observedSigns} onChange={(event) => setObservedSigns(event.target.value)} placeholder="Ex.: grumos observados no leite" /></Field></div></SectionCard>
    <details className="section-card" open={Boolean(initial)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Mais detalhes</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Teto afetado"><Select value={affectedQuarter} onChange={(event) => setAffectedQuarter(event.target.value)}><option value="">Não informado</option>{Object.entries(quarterLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Como foi percebido"><Select value={detectionMethod} onChange={(event) => setDetectionMethod(event.target.value)}><option value="">Não informado</option>{Object.entries(detectionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Tratamento decidido"><Textarea value={treatmentSummary} onChange={(event) => setTreatmentSummary(event.target.value)} placeholder="Registre somente a decisão humana" /></Field><Field label="Início do tratamento"><Input type="date" value={treatmentStartedOn} onChange={(event) => setTreatmentStartedOn(event.target.value)} /></Field><Field label="Fim previsto"><Input type="date" value={treatmentExpectedEndOn} onChange={(event) => setTreatmentExpectedEndOn(event.target.value)} /></Field><Field label="Carência informada até"><Input type="date" value={withdrawalEndsAt} onChange={(event) => setWithdrawalEndsAt(event.target.value)} /></Field><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5" type="checkbox" checked={milkDiscardRequired} onChange={(event) => setMilkDiscardRequired(event.target.checked)} />Descarte de leite informado</label><Field label="Resultado"><Select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">Ainda não informado</option>{Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Outras observações"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div></details>
    <Button className="w-full sm:w-auto sm:self-start" type="submit" disabled={busy || !animalId}>{busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Abrir caso de mastite'}</Button>
  </form>;
}

export function MastitisCasesPage() {
  const { data, loading, error, reload } = useResource<MastitisCase[]>('/api/mastitis-cases');
  const open = (data ?? []).filter((item) => !['RESOLVED', 'CANCELLED'].includes(item.status));
  const previous = (data ?? []).filter((item) => ['RESOLVED', 'CANCELLED'].includes(item.status));
  const list = (items: MastitisCase[]) => <ScrollArea label="Casos de mastite">{items.map((item) => <Link className="mobile-item" key={item.id} to={`/mastite/${item.id}`}><span className="min-w-0"><strong className="block">{animalName(item)}</strong><span className="block text-xs text-[var(--muted)]">Detectado em {formatDate(dateFromTimestamp(item.detectedAt))}</span>{item.withdrawalEndsAt && item.withdrawal && <span className="mt-1 block text-xs font-semibold text-[var(--warning)]">Carência informada até {formatDate(item.withdrawalEndsAt)}</span>}</span><Badge tone={statusTone(item.status)}>{statusLabels[item.status]}</Badge></Link>)}</ScrollArea>;
  return <div className="page"><PageHeader icon={Activity} title="Mastite" subtitle="Fatos observados, decisões humanas, ações e carência informada" action={<Link className="button button-primary" to="/mastite/nova"><Plus size={18} aria-hidden />Registrar mastite</Link>} />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : <div className="grid gap-5"><SectionCard title={`Casos atuais (${open.length})`}>{open.length ? list(open) : <EmptyState title="Nenhum caso aberto" description="Casos em observação, tratamento ou carência aparecerão aqui." />}</SectionCard>{previous.length > 0 && <SectionCard title="Histórico">{list(previous)}</SectionCard>}</div>}
  </div>;
}

export function NewMastitisCasePage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  return <div className="page"><div className="page-narrow"><PageHeader icon={Activity} title="Registrar mastite" subtitle="O sistema registra fatos e o tratamento decidido; não faz diagnóstico" /><MastitisCaseForm initialAnimalId={search.get('animalId') ?? undefined} onSaved={(item) => navigate(`/mastite/${item.id}`, { replace: true })} /></div></div>;
}

function MastitisActions({ item, reload }: { item: MastitisCaseDetail; reload: () => void }) {
  const [scheduledOn, setScheduledOn] = useState(today());
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<MastitisAction | null>(null);
  const [editScheduledOn, setEditScheduledOn] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [error, setError] = useState('');
  async function add(event: FormEvent) {
    event.preventDefault(); setError('');
    try { await api(`/api/mastitis-cases/${item.id}/actions`, json('POST', { scheduledFor: noonIso(scheduledOn), actionDescription: description })); setDescription(''); reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a ação.'); }
  }
  async function act(id: string, action: string) {
    setError('');
    try { await api(`/api/mastitis-actions/${id}`, json('PATCH', { action })); reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a ação.'); }
  }
  async function saveEdit() {
    if (!editing) return;
    setError('');
    try { await api(`/api/mastitis-actions/${editing.id}`, json('PATCH', { action: 'edit', scheduledFor: noonIso(editScheduledOn), actionDescription: editDescription })); setEditing(null); reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível editar a ação.'); }
  }
  return <SectionCard title="Ações de tratamento">{error && <div className="mb-3"><ErrorState message={error} /></div>}
    {!item.actions.length ? <p className="text-sm text-[var(--muted)]">Nenhuma ação programada.</p> : <div>{item.actions.map((action) => <div className="border-b border-[var(--border)] py-3 last:border-b-0" key={action.id}>{editing?.id === action.id ? <div className="grid gap-3 sm:grid-cols-[11rem_1fr_auto]"><Field label="Data"><Input type="date" value={editScheduledOn} onChange={(event) => setEditScheduledOn(event.target.value)} /></Field><Field label="Ação"><Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></Field><div className="flex items-end gap-2"><Button onClick={() => void saveEdit()}>Salvar</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button></div></div> : <div className="sm:flex sm:items-center sm:justify-between sm:gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{action.actionDescription}</strong><Badge tone={action.timing === 'OVERDUE' ? 'danger' : action.timing === 'COMPLETED' ? 'success' : action.timing === 'TODAY' ? 'warning' : 'neutral'}>{timingLabels[action.timing]}</Badge></div><p className="mt-1 text-xs text-[var(--muted)]">{formatDate(dateFromTimestamp(action.scheduledFor))}</p></div><div className="mt-3 flex flex-wrap gap-2 sm:mt-0">{action.timing !== 'COMPLETED' && action.timing !== 'CANCELLED' && <Button onClick={() => void act(action.id, 'complete')}><Check size={16} aria-hidden />Concluir</Button>}{action.timing === 'COMPLETED' && <Button variant="secondary" onClick={() => void act(action.id, 'undo')}>Desfazer</Button>}{action.timing !== 'CANCELLED' && <Button variant="secondary" onClick={() => { setEditing(action); setEditScheduledOn(dateFromTimestamp(action.scheduledFor)); setEditDescription(action.actionDescription); }}>Editar</Button>}{action.timing !== 'CANCELLED' && action.timing !== 'COMPLETED' && <Button variant="danger" onClick={() => void act(action.id, 'cancel')}>Cancelar</Button>}</div></div>}</div>)}</div>}
    <form className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-[11rem_1fr_auto] sm:items-end" onSubmit={(event) => void add(event)}><Field label="Data da ação"><Input type="date" value={scheduledOn} onChange={(event) => setScheduledOn(event.target.value)} required /></Field><Field label="Ação informada"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Reavaliar o leite" required /></Field><Button type="submit" disabled={!description.trim()}>Adicionar ação</Button></form>
  </SectionCard>;
}

export function MastitisCaseDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<MastitisCaseDetail>(`/api/mastitis-cases/${id}`);
  const [editing, setEditing] = useState(false);
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Caso não encontrado.'} retry={reload} /></div>;
  if (editing) return <div className="page"><div className="page-narrow"><PageHeader icon={Activity} title="Editar caso de mastite" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><MastitisCaseForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div></div>;
  return <div className="page"><PageHeader icon={Activity} title={`Mastite — ${animalName(data)}`} subtitle={`Detectado em ${formatDate(dateFromTimestamp(data.detectedAt))}`} action={<Button onClick={() => setEditing(true)}>Editar caso</Button>} />
    <div className="grid gap-5"><SectionCard><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-[var(--muted)]">Animal</p><Link className="text-xl font-bold text-[var(--primary)]" to={`/rebanho/${data.animalId}`}>{animalName(data)}</Link>{data.observedSigns && <p className="mt-3">{data.observedSigns}</p>}{data.affectedQuarter && <p className="mt-2 text-sm">Teto: {quarterLabels[data.affectedQuarter]}</p>}{data.treatmentSummary && <p className="mt-2 text-sm"><strong>Tratamento registrado:</strong> {data.treatmentSummary}</p>}</div><div className="flex flex-wrap gap-2"><Badge tone={statusTone(data.status)}>{statusLabels[data.status]}</Badge>{data.milkDiscardRequired && <Badge tone="danger">Descarte informado</Badge>}</div></div></SectionCard>
      <WithdrawalNotice withdrawalEndsAt={data.withdrawalEndsAt} withdrawal={data.withdrawal} />
      <MastitisActions item={data} reload={reload} />
      {(data.notes || data.outcome) && <SectionCard title="Resultado e observações">{data.outcome && <p><strong>Resultado:</strong> {outcomeLabels[data.outcome]}</p>}{data.notes && <p className="mt-2 text-sm">{data.notes}</p>}</SectionCard>}
    </div>
  </div>;
}
