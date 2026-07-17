import { useState } from 'react';
import { Activity, Check, Plus } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDate } from '../../domain/format';
import { Badge, Button, EmptyState, ErrorState, Field, FormErrorSummary, InlineEmpty, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatusBadge, SubmitBar, Textarea } from '../components/ui';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, json } from '../lib/api';
import { today } from '../lib/labels';
import { mastitisDetectionLabel, mastitisOutcomeLabel, mastitisQuarterLabel, mastitisStatusDescriptor, mastitisTimingDescriptor } from '../lib/status';

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

function WithdrawalNotice({ withdrawalEndsAt, withdrawal }: { withdrawalEndsAt: string | null; withdrawal: Withdrawal }) {
  if (!withdrawalEndsAt || !withdrawal) return null;
  const detail = withdrawal.state === 'ACTIVE' ? `${withdrawal.days} dia(s) restante(s)` : withdrawal.state === 'ENDS_TODAY' ? 'A data informada termina hoje' : `Data informada passou há ${Math.abs(withdrawal.days)} dia(s)`;
  return <div className={`notice ${withdrawal.state === 'PAST_DUE' ? 'notice-error' : 'notice-warning'}`}><strong>Carência informada até {formatDate(withdrawalEndsAt)}</strong><br />{detail}<br /><span className="text-xs">Confirme o encerramento antes de voltar a utilizar o leite normalmente.</span></div>;
}

function MastitisCaseForm({ initial, initialAnimalId, onSaved }: { initial?: MastitisCaseDetail; initialAnimalId?: string; onSaved: (item: MastitisCase) => void }) {
  const { data: animals, loading: loadingAnimals, error: animalError } = useResource<Animal[]>('/api/animals');
  const { busy, error, run } = useSubmit();
  const form = useForm(
    {
      animalId: initial?.animalId ?? initialAnimalId ?? '',
      detectedOn: dateFromTimestamp(initial?.detectedAt) || today(),
      status: initial?.status ?? 'OBSERVATION',
      observedSigns: initial?.observedSigns ?? '',
      affectedQuarter: initial?.affectedQuarter ?? '',
      detectionMethod: initial?.detectionMethod ?? '',
      treatmentSummary: initial?.treatmentSummary ?? '',
      treatmentStartedOn: dateFromTimestamp(initial?.treatmentStartedAt),
      treatmentExpectedEndOn: dateFromTimestamp(initial?.treatmentExpectedEndAt),
      withdrawalEndsAt: initial?.withdrawalEndsAt ?? '',
      milkDiscardRequired: initial?.milkDiscardRequired ?? false,
      outcome: initial?.outcome ?? '',
      notes: initial?.notes ?? '',
    },
    {
      animalId: (value) => (value ? undefined : 'Escolha o animal.'),
      detectedOn: (value) => (value ? undefined : 'Informe a data em que o sinal foi percebido.'),
      observedSigns: (value, all) => (!value.trim() && !all.notes.trim() ? 'Informe o sinal percebido ou uma observação.' : undefined),
    },
  );
  useUnsavedGuard(form.dirty);

  async function persist() {
    const { animalId, detectedOn, status, observedSigns, affectedQuarter, detectionMethod, treatmentSummary, treatmentStartedOn, treatmentExpectedEndOn, withdrawalEndsAt, milkDiscardRequired, outcome, notes } = form.values;
    const body = {
      animalId, detectedAt: noonIso(detectedOn), status, observedSigns: observedSigns.trim() || null,
      affectedQuarter: affectedQuarter || null, detectionMethod: detectionMethod || null,
      treatmentSummary: treatmentSummary.trim() || null, treatmentStartedAt: treatmentStartedOn ? noonIso(treatmentStartedOn) : null,
      treatmentExpectedEndAt: treatmentExpectedEndOn ? noonIso(treatmentExpectedEndOn) : null, withdrawalEndsAt: withdrawalEndsAt || null,
      milkDiscardRequired, outcome: outcome || null, notes: notes.trim() || null, resolvedAt: initial?.resolvedAt ?? null,
    };
    const saved = await api<MastitisCase>(initial ? `/api/mastitis-cases/${initial.id}` : '/api/mastitis-cases', json(initial ? 'PATCH' : 'POST', body));
    onSaved(saved);
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>{(error || animalError) && <ErrorState message={error || animalError} />}<FormErrorSummary errors={form.visibleErrors} />
    <SectionCard title="Registro rápido"><div className="grid gap-3 sm:grid-cols-2"><Field label="Animal" error={form.error('animalId')}><Select value={form.values.animalId} onChange={(event) => form.set('animalId', event.target.value)} onBlur={() => form.blur('animalId')} disabled={loadingAnimals} required><option value="">Selecione</option>{animals?.map((animal) => <option key={animal.id} value={animal.id}>{animalName(animal)}</option>)}</Select></Field><Field label="Data" error={form.error('detectedOn')}><Input type="date" value={form.values.detectedOn} onChange={(event) => form.set('detectedOn', event.target.value)} onBlur={() => form.blur('detectedOn')} required /></Field><Field label="Status inicial"><Select value={form.values.status} onChange={(event) => form.set('status', event.target.value)}>{Object.entries(mastitisStatusDescriptor).map(([value, { label }]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Sinal percebido ou observação" hint="Registre o fato percebido; não é diagnóstico." error={form.error('observedSigns')}><Textarea className="min-h-20" value={form.values.observedSigns} onChange={(event) => form.set('observedSigns', event.target.value)} onBlur={() => form.blur('observedSigns')} placeholder="Ex.: grumos observados no leite" /></Field></div></SectionCard>
    <details className="section-card" open={Boolean(initial)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Mais detalhes</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Teto afetado"><Select value={form.values.affectedQuarter} onChange={(event) => form.set('affectedQuarter', event.target.value)}><option value="">Não informado</option>{Object.entries(mastitisQuarterLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Como foi percebido"><Select value={form.values.detectionMethod} onChange={(event) => form.set('detectionMethod', event.target.value)}><option value="">Não informado</option>{Object.entries(mastitisDetectionLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Tratamento decidido"><Textarea value={form.values.treatmentSummary} onChange={(event) => form.set('treatmentSummary', event.target.value)} placeholder="Registre somente a decisão humana" /></Field><Field label="Início do tratamento"><Input type="date" value={form.values.treatmentStartedOn} onChange={(event) => form.set('treatmentStartedOn', event.target.value)} /></Field><Field label="Fim previsto"><Input type="date" value={form.values.treatmentExpectedEndOn} onChange={(event) => form.set('treatmentExpectedEndOn', event.target.value)} /></Field><Field label="Carência informada até"><Input type="date" value={form.values.withdrawalEndsAt} onChange={(event) => form.set('withdrawalEndsAt', event.target.value)} /></Field><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input className="h-5 w-5" type="checkbox" checked={form.values.milkDiscardRequired} onChange={(event) => form.set('milkDiscardRequired', event.target.checked)} />Descarte de leite informado</label><Field label="Resultado"><Select value={form.values.outcome} onChange={(event) => form.set('outcome', event.target.value)}><option value="">Ainda não informado</option>{Object.entries(mastitisOutcomeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Outras observações"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field></div></details>
    <SubmitBar label={initial ? 'Salvar alterações' : 'Abrir caso de mastite'} busy={busy} />
  </form>;
}

export function MastitisCasesPage() {
  const { data, loading, error, reload } = useResource<MastitisCase[]>('/api/mastitis-cases');
  const open = (data ?? []).filter((item) => !['RESOLVED', 'CANCELLED'].includes(item.status));
  const previous = (data ?? []).filter((item) => ['RESOLVED', 'CANCELLED'].includes(item.status));
  const list = (items: MastitisCase[]) => <ScrollArea label="Casos de mastite">{items.map((item) => <Link className="mobile-item" key={item.id} to={`/mastite/${item.id}`}><span className="min-w-0"><strong className="block">{animalName(item)}</strong><span className="block text-xs text-[var(--muted)]">Detectado em {formatDate(dateFromTimestamp(item.detectedAt))}</span>{item.withdrawalEndsAt && item.withdrawal && <span className="mt-1 block text-xs font-semibold text-[var(--warning)]">Carência informada até {formatDate(item.withdrawalEndsAt)}</span>}</span><StatusBadge descriptor={mastitisStatusDescriptor[item.status]} /></Link>)}</ScrollArea>;
  return <div className="page"><PageHeader icon={Activity} title="Mastite" subtitle="Fatos observados, decisões humanas, ações e carência informada" action={<Link className="button button-primary" to="/mastite/nova"><Plus size={18} aria-hidden />Registrar mastite</Link>} />
    {loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} retry={reload} /> : <div className="grid gap-5"><SectionCard title={`Casos atuais (${open.length})`}>{open.length ? list(open) : <EmptyState title="Nenhum caso aberto" description="Casos em observação, tratamento ou carência aparecerão aqui." />}</SectionCard>{previous.length > 0 && <SectionCard title="Histórico">{list(previous)}</SectionCard>}</div>}
  </div>;
}

export function NewMastitisCasePage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  return <div className="page"><div className="page-narrow"><PageHeader icon={Activity} title="Registrar mastite" subtitle="O sistema registra fatos e o tratamento decidido; não faz diagnóstico" /><MastitisCaseForm initialAnimalId={search.get('animalId') ?? undefined} onSaved={(item) => navigate(`/mastite/${item.id}`, { replace: true })} /></div></div>;
}

function MastitisActions({ item, reload }: { item: MastitisCaseDetail; reload: () => void }) {
  const { busy, error, setError, run } = useSubmit();
  const form = useForm(
    { scheduledOn: today(), description: '' },
    {
      scheduledOn: (value) => (value ? undefined : 'Informe a data da ação.'),
      description: (value) => (value.trim() ? undefined : 'Informe a ação.'),
    },
  );
  const [editing, setEditing] = useState<MastitisAction | null>(null);
  const [editScheduledOn, setEditScheduledOn] = useState('');
  const [editDescription, setEditDescription] = useState('');
  async function persistAdd() {
    await api(`/api/mastitis-cases/${item.id}/actions`, json('POST', { scheduledFor: noonIso(form.values.scheduledOn), actionDescription: form.values.description }));
    form.reset({ scheduledOn: today(), description: '' });
    reload();
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
    {!item.actions.length ? <InlineEmpty>Nenhuma ação programada.</InlineEmpty> : <div>{item.actions.map((action) => <div className="border-b border-[var(--border)] py-3 last:border-b-0" key={action.id}>{editing?.id === action.id ?<div className="grid gap-3 sm:grid-cols-[11rem_1fr_auto]"><Field label="Data"><Input type="date" value={editScheduledOn} onChange={(event) => setEditScheduledOn(event.target.value)} /></Field><Field label="Ação"><Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></Field><div className="flex items-end gap-2"><Button onClick={() => void saveEdit()}>Salvar</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button></div></div> : <div className="sm:flex sm:items-center sm:justify-between sm:gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{action.actionDescription}</strong><StatusBadge descriptor={mastitisTimingDescriptor[action.timing]} /></div><p className="mt-1 text-xs text-[var(--muted)]">{formatDate(dateFromTimestamp(action.scheduledFor))}</p></div><div className="mt-3 flex flex-wrap gap-2 sm:mt-0">{action.timing !== 'COMPLETED' && action.timing !== 'CANCELLED' && <Button onClick={() => void act(action.id, 'complete')}><Check size={16} aria-hidden />Concluir</Button>}{action.timing === 'COMPLETED' && <Button variant="secondary" onClick={() => void act(action.id, 'undo')}>Desfazer</Button>}{action.timing !== 'CANCELLED' && <Button variant="secondary" onClick={() => { setEditing(action); setEditScheduledOn(dateFromTimestamp(action.scheduledFor)); setEditDescription(action.actionDescription); }}>Editar</Button>}{action.timing !== 'CANCELLED' && action.timing !== 'COMPLETED' && <Button variant="danger" onClick={() => void act(action.id, 'cancel')}>Cancelar</Button>}</div></div>}</div>)}</div>}
    <div className="mt-4 border-t border-[var(--border)] pt-4"><FormErrorSummary errors={form.visibleErrors} /><form className="grid gap-3 sm:grid-cols-[11rem_1fr_auto] sm:items-end" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persistAdd); }}><Field label="Data da ação" error={form.error('scheduledOn')}><Input type="date" value={form.values.scheduledOn} onChange={(event) => form.set('scheduledOn', event.target.value)} onBlur={() => form.blur('scheduledOn')} required /></Field><Field label="Ação informada" error={form.error('description')}><Input value={form.values.description} onChange={(event) => form.set('description', event.target.value)} onBlur={() => form.blur('description')} placeholder="Ex.: Reavaliar o leite" required /></Field><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Adicionar ação'}</Button></form></div>
  </SectionCard>;
}

export function MastitisCaseDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<MastitisCaseDetail>(`/api/mastitis-cases/${id}`);
  const [editing, setEditing] = useState(false);
  if (loading) return <div className="page"><SkeletonList rows={4} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Caso não encontrado.'} retry={reload} /></div>;
  if (editing) return <div className="page"><div className="page-narrow"><PageHeader icon={Activity} title="Editar caso de mastite" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><MastitisCaseForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div></div>;
  return <div className="page"><PageHeader icon={Activity} title={`Mastite — ${animalName(data)}`} subtitle={`Detectado em ${formatDate(dateFromTimestamp(data.detectedAt))}`} action={<Button onClick={() => setEditing(true)}>Editar caso</Button>} />
    <div className="grid gap-5"><SectionCard><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-[var(--muted)]">Animal</p><Link className="text-xl font-bold text-[var(--primary)]" to={`/rebanho/${data.animalId}`}>{animalName(data)}</Link>{data.observedSigns && <p className="mt-3">{data.observedSigns}</p>}{data.affectedQuarter && <p className="mt-2 text-sm">Teto: {mastitisQuarterLabel[data.affectedQuarter]}</p>}{data.treatmentSummary && <p className="mt-2 text-sm"><strong>Tratamento registrado:</strong> {data.treatmentSummary}</p>}</div><div className="flex flex-wrap gap-2"><StatusBadge descriptor={mastitisStatusDescriptor[data.status]} />{data.milkDiscardRequired &&<Badge tone="danger">Descarte informado</Badge>}</div></div></SectionCard>
      <WithdrawalNotice withdrawalEndsAt={data.withdrawalEndsAt} withdrawal={data.withdrawal} />
      <MastitisActions item={data} reload={reload} />
      {(data.notes || data.outcome) && <SectionCard title="Resultado e observações">{data.outcome && <p><strong>Resultado:</strong> {mastitisOutcomeLabel[data.outcome]}</p>}{data.notes && <p className="mt-2 text-sm">{data.notes}</p>}</SectionCard>}
    </div>
  </div>;
}
