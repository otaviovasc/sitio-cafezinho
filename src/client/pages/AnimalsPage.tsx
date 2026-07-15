import { FormEvent, useState } from 'react';
import { ArrowRightLeft, ChartLine, HeartPulse, Pencil, Plus, Scale, Tags, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AnimalStatus } from '../../domain/animal-lifecycle';
import { allowedNextStatuses, statusRequiresMilkingGroup, statusTone } from '../../domain/animal-lifecycle';
import { filterByPeriod, type PeriodDays } from '../../domain/analytics';
import { formatDate, formatLiters } from '../../domain/format';
import { formatWeight } from '../../domain/weight';
import { CowHead } from '../components/icons';
import { PeriodSelector } from '../components/PeriodSelector';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { Badge, Button, ConfirmButton, EmptyState, ErrorState, Field, FilterBar, Input, LoadingState, PageHeader, ScrollArea, SectionCard, Select, StatCard, Textarea } from '../components/ui';
import { AnimalGroupChangeForm } from '../features/animals/AnimalGroupChangeForm';
import { AnimalStatusChangeForm } from '../features/animals/AnimalStatusChangeForm';
import { AnimalWeightPanel, type AnimalWeight } from '../features/animals/AnimalWeightPanel';
import { BulkAnimalForm } from '../features/animals/BulkAnimalForm';
import { GroupPicker, type HerdGroup } from '../features/animals/GroupPicker';
import { ReproductiveEventForm, type ReproductiveEvent } from '../features/animals/ReproductiveEventForm';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { animalStatusLabels, milkingRoutineLabels, today } from '../lib/labels';

type Alias = { id: string; alias: string };
type CurrentGroup = Pick<HerdGroup, 'id' | 'name' | 'milkingRoutine'>;
type Animal = {
  id: string;
  name: string | null;
  tagNumber: string | null;
  status: AnimalStatus;
  notes: string | null;
  aliases: Alias[];
  currentGroup: CurrentGroup | null;
  latestWeight: null | { weightKg: string; measuredAt: string };
  latestProduction: null | { totalLiters: string; sessionDate: string };
};
type GroupHistory = { id: string; groupId: string; groupName: string; milkingRoutine: string; startedOn: string; endedOn: string | null; notes: string | null };
type StatusHistory = { id: string; previousStatus: AnimalStatus | null; status: AnimalStatus; changedOn: string; notes: string | null };
type AnimalDetail = Omit<Animal, 'latestWeight' | 'latestProduction'> & {
  weights: AnimalWeight[];
  history: Array<{ id: string; sessionDate: string; morningLiters: string | null; afternoonLiters: string | null; totalLiters: string; status: string }>;
  groupHistory: GroupHistory[];
  statusHistory: StatusHistory[];
  reproductiveEvents: ReproductiveEvent[];
  reproductiveSummary: { lastCalvingOn: string | null; lastHeatOn: string | null; attemptsInCurrentCycle: number; pendingAttempts: number; lastPregnancyOn: string | null; attemptsUntilLastPregnancy: number | null };
};

function animalName(animal: Pick<Animal, 'name' | 'tagNumber'>) { return animal.name || `Brinco ${animal.tagNumber}`; }

export function AnimalsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [groupId, setGroupId] = useState('ALL');
  const [attention, setAttention] = useState('ALL');
  const { data, loading, error, reload } = useResource<Animal[]>('/api/animals');
  const { data: groups = [] } = useResource<HerdGroup[]>('/api/herd-groups');
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = data?.filter((animal) => {
    const matchesSearch = `${animal.name || ''} ${animal.tagNumber || ''} ${animal.aliases.map((alias) => alias.alias).join(' ')}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
    const matchesAttention = attention === 'ALL'
      || (attention === 'NO_GROUP' && animal.status === 'LACTATING' && !animal.currentGroup)
      || (attention === 'NO_WEIGHT' && !animal.latestWeight)
      || (attention === 'NO_PRODUCTION' && animal.status === 'LACTATING' && !animal.latestProduction);
    return matchesSearch && matchesAttention && (status === 'ALL' || animal.status === status) && (groupId === 'ALL' || animal.currentGroup?.id === groupId);
  }) ?? [];
  const lactating = data?.filter((animal) => animal.status === 'LACTATING').length ?? 0;
  const dry = data?.filter((animal) => animal.status === 'DRY').length ?? 0;
  const heifers = data?.filter((animal) => animal.status === 'HEIFER').length ?? 0;
  return <div className="page">
    <PageHeader icon={CowHead} title="Rebanho" subtitle="Ciclo produtivo, lote de ordenha e histórico de cada vaca" action={<Link className="button button-primary" to="/rebanho/novo"><Plus size={18} aria-hidden />Cadastrar</Link>} />
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Total cadastrado" value={data?.length ?? 0} /><StatCard label="Em lactação" value={lactating} /><StatCard label="Secas" value={dry} /><StatCard label="Novilhas" value={heifers} /></div>
    <FilterBar>
      <Field label="Buscar"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, brinco ou alias" /></Field>
      <div className="hidden gap-3 lg:flex">
        <Field label="Situação"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Todas</option>{Object.entries(animalStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        <Field label="Lote"><Select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="ALL">Todos</option>{groups?.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>
        <Field label="Atenção"><Select value={attention} onChange={(event) => setAttention(event.target.value)}><option value="ALL">Todos os registros</option><option value="NO_GROUP">Em lactação sem lote</option><option value="NO_WEIGHT">Sem pesagem</option><option value="NO_PRODUCTION">Sem controle individual</option></Select></Field>
      </div>
      <details className="rounded-xl border border-[var(--border)] px-3 py-2 lg:hidden"><summary className="cursor-pointer py-1 text-sm font-bold">Mais filtros{status !== 'ALL' || groupId !== 'ALL' || attention !== 'ALL' ? ' · ativos' : ''}</summary><div className="mt-3 grid gap-3"><Field label="Situação"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Todas</option>{Object.entries(animalStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Lote"><Select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="ALL">Todos</option>{groups?.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field><Field label="Atenção"><Select value={attention} onChange={(event) => setAttention(event.target.value)}><option value="ALL">Todos os registros</option><option value="NO_GROUP">Em lactação sem lote</option><option value="NO_WEIGHT">Sem pesagem</option><option value="NO_PRODUCTION">Sem controle individual</option></Select></Field></div></details>
    </FilterBar>
    <div className="mt-5">{loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : !filtered.length ? <EmptyState title="Nenhum animal encontrado" description="Ajuste a busca ou os filtros aplicados." /> : <SectionCard>
      <ScrollArea label="Lista do rebanho" className="max-h-[42rem]">
        <div className="hidden lg:block"><table className="data-table"><thead><tr><th>Animal</th><th>Ciclo</th><th>Lote de ordenha</th><th>Último controle</th><th>Último peso</th></tr></thead><tbody>{filtered.map((animal) => <tr key={animal.id}><td colSpan={5} className="p-0"><Link aria-label={`Abrir histórico de ${animalName(animal)}`} className="grid grid-cols-[1.35fr_1fr_1.2fr_1fr_1fr] items-center gap-3 border-b border-[var(--border)] px-3 py-3 text-[var(--text)] transition hover:bg-[var(--surface-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]" to={`/rebanho/${animal.id}`}><span className="min-w-0"><strong className="text-[var(--primary)]">{animalName(animal)}</strong>{animal.name && animal.tagNumber && <span className="block text-xs text-[var(--muted)]">Brinco {animal.tagNumber}</span>}</span><Badge tone={statusTone(animal.status)}>{animalStatusLabels[animal.status]}</Badge><span className="text-sm">{animal.currentGroup?.name ?? '—'}{animal.currentGroup && <span className="block text-xs text-[var(--muted)]">{milkingRoutineLabels[animal.currentGroup.milkingRoutine]}</span>}</span><span className="text-sm">{animal.latestProduction ? <><strong>{formatLiters(animal.latestProduction.totalLiters)}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(animal.latestProduction.sessionDate)}</span></> : '—'}</span><span className="text-sm">{animal.latestWeight ? <><strong>{formatWeight(animal.latestWeight.weightKg)}</strong><span className="block text-xs text-[var(--muted)]">{new Date(animal.latestWeight.measuredAt).toLocaleDateString('pt-BR')}</span></> : '—'}</span></Link></td></tr>)}</tbody></table></div>
        <div className="lg:hidden">{filtered.map((animal) => <Link aria-label={`Abrir histórico de ${animalName(animal)}`} className="block border-b border-[var(--border)] px-1 py-4 text-[var(--text)] transition last:border-b-0 hover:bg-[var(--surface-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" to={`/rebanho/${animal.id}`} key={animal.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-[var(--primary)]">{animalName(animal)}</strong><span className="text-sm text-[var(--muted)]">{animal.currentGroup?.name ?? (animal.status === 'LACTATING' ? 'Sem lote' : 'Fora da ordenha')}{animal.name && animal.tagNumber ? ` · Brinco ${animal.tagNumber}` : ''}</span></div><Badge tone={statusTone(animal.status)}>{animalStatusLabels[animal.status]}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><span className="block text-xs text-[var(--muted)]">Último controle</span><strong>{animal.latestProduction ? formatLiters(animal.latestProduction.totalLiters) : 'Sem medição'}</strong></div><div><span className="block text-xs text-[var(--muted)]">Último peso</span><strong>{animal.latestWeight ? formatWeight(animal.latestWeight.weightKg) : 'Sem pesagem'}</strong></div></div></Link>)}</div>
      </ScrollArea>
    </SectionCard>}</div>
  </div>;
}

function AnimalForm({ initial, onSaved }: { initial?: AnimalDetail; onSaved?: () => void | Promise<void> }) {
  const [name, setName] = useState(initial?.name || '');
  const [tagNumber, setTagNumber] = useState(initial?.tagNumber || '');
  const [status, setStatus] = useState<AnimalStatus>(initial?.status || 'LACTATING');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [groupId, setGroupId] = useState(initial?.currentGroup?.id || '');
  const [changedOn, setChangedOn] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { name: name.trim() || null, tagNumber: tagNumber.trim() || null, notes: notes.trim() || null, ...(!initial ? { status, groupId: statusRequiresMilkingGroup(status) ? groupId : null, changedOn } : {}) };
      const saved = await api<{ id: string }>(initial ? `/api/animals/${initial.id}` : '/api/animals', json(initial ? 'PATCH' : 'POST', body));
      if (initial && onSaved) await onSaved(); else navigate(`/rebanho/${saved.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <form className="page-narrow grid gap-5" onSubmit={submit}>{error && <ErrorState message={error} />}<SectionCard><div className="grid gap-4"><Field label="Nome" hint="Nome usado pela família"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Número do brinco" hint="Obrigatório apenas se o nome ficar vazio"><Input inputMode="numeric" value={tagNumber} onChange={(event) => setTagNumber(event.target.value)} /></Field>{!initial && <><div className="grid gap-3 sm:grid-cols-2"><Field label="Situação inicial"><Select value={status} onChange={(event) => setStatus(event.target.value as AnimalStatus)}>{Object.entries(animalStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Data inicial"><Input type="date" value={changedOn} max={today()} onChange={(event) => setChangedOn(event.target.value)} /></Field></div>{statusRequiresMilkingGroup(status) && <GroupPicker label="Lote de ordenha" value={groupId} onChange={setGroupId} />}</>}<Field label="Observações"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div></SectionCard><Button type="submit" disabled={busy || (!name.trim() && !tagNumber.trim()) || (!initial && statusRequiresMilkingGroup(status) && !groupId)}>{busy ? 'Salvando…' : 'Salvar animal'}</Button></form>;
}

export function NewAnimalPage() {
  const [mode, setMode] = useState<'ONE' | 'MANY'>('ONE');
  const navigate = useNavigate();
  return <div className="page"><PageHeader icon={CowHead} title="Cadastrar rebanho" subtitle="Cadastre uma vaca ou uma lista com situação e lote em comum" /><div className="mb-5 flex gap-2"><Button variant={mode === 'ONE' ? 'primary' : 'secondary'} onClick={() => setMode('ONE')}>Um animal</Button><Button variant={mode === 'MANY' ? 'primary' : 'secondary'} onClick={() => setMode('MANY')}>Vários animais</Button></div>{mode === 'ONE' ? <AnimalForm /> : <BulkAnimalForm onSaved={(firstId) => navigate(firstId ? `/rebanho/${firstId}` : '/rebanho')} />}</div>;
}

export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<AnimalDetail>(`/api/animals/${id}`);
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState('');
  const [actionError, setActionError] = useState('');
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showReproductiveForm, setShowReproductiveForm] = useState(false);
  const [editingReproductiveEvent, setEditingReproductiveEvent] = useState<ReproductiveEvent | undefined>();
  const [productionPeriod, setProductionPeriod] = useState<PeriodDays>(180);
  async function addAlias(event: FormEvent) { event.preventDefault(); setActionError(''); try { await api(`/api/animals/${id}/aliases`, json('POST', { alias })); setAlias(''); reload(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível adicionar.'); } }
  async function removeAlias(aliasId: string) { try { await api(`/api/animal-aliases/${aliasId}`, { method: 'DELETE' }); reload(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível remover.'); } }
  async function removeReproductiveEvent(eventId: string) { try { await api(`/api/animals/${id}/reproductive-events/${eventId}`, { method: 'DELETE' }); await reload(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir o registro.'); } }
  async function undoStatus(eventId: string) { try { await api(`/api/animals/${id}/status-changes/${eventId}`, { method: 'DELETE' }); setShowStatusForm(false); await reload(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível desfazer a mudança.'); } }
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Animal não encontrado.'} retry={reload} /></div>;
  if (editing) return <div className="page"><PageHeader title="Editar identificação" subtitle="A situação e o lote possuem fluxos próprios para preservar o histórico" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><AnimalForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div>;
  const confirmedHistory = data.history.filter((row) => row.status === 'CONFIRMED');
  const productionRows = filterByPeriod(confirmedHistory.map((row) => ({ date: row.sessionDate, morning: row.morningLiters, afternoon: row.afternoonLiters, total: row.totalLiters })).sort((a, b) => a.date.localeCompare(b.date)), productionPeriod, today());
  const confirmedWeights = data.weights.filter((row) => row.status === 'CONFIRMED' && row.weightKg !== null);
  const weightRows = [...confirmedWeights].reverse().map((row) => ({ date: row.sessionDate ?? row.measuredAt.slice(0, 10), weight: row.weightKg }));
  const latestProduction = confirmedHistory[0];
  const latestWeight = confirmedWeights[0];
  const latestStatus = data.statusHistory[0];
  const reproductiveState = data.reproductiveSummary.lastPregnancyOn
    ? 'Prenhez confirmada'
    : data.reproductiveSummary.pendingAttempts > 0 ? 'Aguardando confirmação'
      : data.reproductiveSummary.lastHeatOn ? 'Cio acompanhado' : 'Sem registro recente';
  const timeline = [
    ...data.statusHistory.map((event) => ({ kind: 'STATUS' as const, date: event.changedOn, event })),
    ...data.reproductiveEvents.filter((event) => event.type === 'HEAT').map((event) => ({ kind: 'HEAT' as const, date: event.occurredOn, event })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return <div className="page"><PageHeader icon={CowHead} title={animalName(data)} subtitle={data.name && data.tagNumber ? `Brinco ${data.tagNumber}` : 'Histórico completo do animal'} action={<Button onClick={() => setEditing(true)}><Pencil size={17} aria-hidden />Editar identificação</Button>} />
    {actionError && <div className="mb-5"><ErrorState message={actionError} /></div>}
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Situação atual" value={<Badge tone={statusTone(data.status)}>{animalStatusLabels[data.status]}</Badge>} detail={latestStatus ? `Desde ${formatDate(latestStatus.changedOn)}` : undefined} /><StatCard label="Reprodução" value={reproductiveState} detail={data.reproductiveSummary.lastHeatOn ? `Último cio em ${formatDate(data.reproductiveSummary.lastHeatOn)}` : 'Registre somente fatos observados'} /><StatCard label="Lote de ordenha" value={data.currentGroup?.name ?? (data.status === 'LACTATING' ? 'Sem lote' : 'Não se aplica')} detail={data.currentGroup ? milkingRoutineLabels[data.currentGroup.milkingRoutine] : data.status === 'LACTATING' ? 'Precisa de atenção' : 'Fora da lactação'} /><StatCard label="Último controle" value={latestProduction ? formatLiters(latestProduction.totalLiters) : '—'} detail={latestProduction ? formatDate(latestProduction.sessionDate) : 'Sem medição individual'} /><StatCard label="Último peso" value={latestWeight?.weightKg ? formatWeight(latestWeight.weightKg) : '—'} detail={latestWeight ? new Date(latestWeight.measuredAt).toLocaleDateString('pt-BR') : 'Sem pesagem'} /></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Ciclo produtivo e reprodução" icon={HeartPulse} className="lg:col-span-2">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[var(--surface-strong)] p-4">
              <p><span className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Situação produtiva</span><span className="mt-1 block"><Badge tone={statusTone(data.status)}>{animalStatusLabels[data.status]}</Badge></span><span className="mt-2 block text-sm text-[var(--muted)]">{data.status === 'HEIFER' ? 'Antes da primeira lactação; não entra nos lotes de ordenha.' : data.status === 'LACTATING' ? 'Produz leite e deve estar em um lote de ordenha.' : data.status === 'DRY' ? 'Entre lactações; não deve receber medição de leite.' : 'Fora do rebanho atual.'}</span></p>
              {allowedNextStatuses(data.status).length > 0 && <Button onClick={() => setShowStatusForm((value) => !value)}>{data.status === 'LACTATING' ? 'Iniciar período seco' : data.status === 'DRY' || data.status === 'HEIFER' ? 'Registrar parto' : 'Alterar situação'}</Button>}
            </div>
            {showStatusForm && <div className="mt-4"><AnimalStatusChangeForm animalId={id} currentStatus={data.status} onCancel={() => setShowStatusForm(false)} onSaved={async () => { await reload(); setShowStatusForm(false); }} /></div>}
            <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setEditingReproductiveEvent(undefined); setShowReproductiveForm((value) => !value); }}><HeartPulse size={17} aria-hidden />Registrar cio</Button>{latestStatus?.previousStatus && <ConfirmButton variant="secondary" question={`Desfazer a mudança mais recente para ${animalStatusLabels[latestStatus.status]}?`} onClick={() => void undoStatus(latestStatus.id)}>Desfazer última situação</ConfirmButton>}</div>
            {showReproductiveForm && <div className="mt-4"><ReproductiveEventForm animalId={id} initial={editingReproductiveEvent} onCancel={() => { setShowReproductiveForm(false); setEditingReproductiveEvent(undefined); }} onSaved={async () => { await reload(); setShowReproductiveForm(false); setEditingReproductiveEvent(undefined); }} /></div>}
          </div>
          <div className="grid grid-cols-2 gap-3 self-start">
            <StatCard label="Último parto" value={data.reproductiveSummary.lastCalvingOn ? formatDate(data.reproductiveSummary.lastCalvingOn) : '—'} detail="Parto registrado ao iniciar lactação" />
            <StatCard label="Último cio" value={data.reproductiveSummary.lastHeatOn ? formatDate(data.reproductiveSummary.lastHeatOn) : '—'} />
            <StatCard label="Coberturas no ciclo" value={data.reproductiveSummary.attemptsInCurrentCycle} detail={data.reproductiveSummary.pendingAttempts ? `${data.reproductiveSummary.pendingAttempts} aguardando resultado` : 'Nenhuma pendente'} />
            <StatCard label="Prenhez no ciclo" value={data.reproductiveSummary.lastPregnancyOn ? 'Confirmada' : 'Não confirmada'} detail={data.reproductiveSummary.attemptsUntilLastPregnancy ? `${data.reproductiveSummary.attemptsUntilLastPregnancy} tentativa(s)` : 'Sem inferência automática'} />
          </div>
        </div>
        <h3 className="mt-6 text-sm font-bold">Linha do tempo</h3>
        <ScrollArea label="Linha do tempo produtiva e reprodutiva" className="mt-2 max-h-96">{timeline.map((item) => item.kind === 'STATUS' ? <div className="mobile-item items-start" key={`status-${item.event.id}`}><span><strong>{item.event.status === 'LACTATING' && item.event.previousStatus ? 'Parto e início da lactação' : animalStatusLabels[item.event.status]}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.event.changedOn)}{item.event.previousStatus ? ` · antes: ${animalStatusLabels[item.event.previousStatus]}` : ' · situação inicial'}</span>{item.event.notes && <span className="block text-xs text-[var(--muted)]">{item.event.notes}</span>}</span><Badge tone={statusTone(item.event.status)}>Ciclo</Badge></div> : <div className="mobile-item items-start" key={`heat-${item.event.id}`}><span><strong>{item.event.hadBreeding ? 'Cio com cobertura' : 'Cio observado'}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.event.occurredOn)}{item.event.bullName ? ` · touro: ${item.event.bullName}` : ''}</span>{item.event.hadBreeding && <span className="block text-xs text-[var(--muted)]">{item.event.outcome === 'PREGNANT' ? 'Prenhez confirmada' : item.event.outcome === 'NOT_PREGNANT' ? 'Não emprenhou' : 'Aguardando confirmação'}{item.event.outcomeRecordedOn ? ` em ${formatDate(item.event.outcomeRecordedOn)}` : ''}</span>}{item.event.notes && <span className="block text-xs text-[var(--muted)]">{item.event.notes}</span>}</span><span className="flex shrink-0 gap-1"><Button variant="secondary" aria-label="Editar cio" onClick={() => { setEditingReproductiveEvent(item.event); setShowReproductiveForm(true); }}><Pencil size={15} aria-hidden /></Button><ConfirmButton variant="danger" aria-label="Excluir cio" question="Excluir este registro de cio?" onClick={() => void removeReproductiveEvent(item.event.id)}>Excluir</ConfirmButton></span></div>)}</ScrollArea>
      </SectionCard>
      <SectionCard title="Lote de ordenha" icon={Tags}><p className="text-sm">{data.status !== 'LACTATING' ? 'Fora da lactação, a vaca não pertence a um lote de ordenha.' : <>Atual: <strong>{data.currentGroup?.name ?? 'Sem lote'}</strong>{data.currentGroup && <span className="block text-[var(--muted)]">{milkingRoutineLabels[data.currentGroup.milkingRoutine]}</span>}</>}</p>{data.status === 'LACTATING' && <><Button className="mt-4" variant="secondary" onClick={() => setShowGroupForm((value) => !value)}><ArrowRightLeft size={17} aria-hidden />Mudar lote</Button>{showGroupForm && <div className="mt-4"><AnimalGroupChangeForm animalId={id} currentGroupId={data.currentGroup?.id} onCancel={() => setShowGroupForm(false)} onSaved={async () => { await reload(); setShowGroupForm(false); }} /></div>}</>}<h3 className="mt-5 text-sm font-bold">Histórico de lotes</h3>{!data.groupHistory.length ? <p className="mt-2 text-sm text-[var(--muted)]">Nenhum lote registrado.</p> : <ScrollArea label="Histórico de lotes de ordenha" className="mt-2 max-h-64">{data.groupHistory.map((row) => <div className="mobile-item" key={row.id}><span><strong>{row.groupName}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(row.startedOn)}{row.endedOn ? ` até ${formatDate(row.endedOn)}` : ' até hoje'}</span>{row.notes && <span className="block text-xs text-[var(--muted)]">{row.notes}</span>}</span></div>)}</ScrollArea>}</SectionCard>
      <SectionCard title="Evolução da produção" icon={ChartLine} className="lg:col-span-2"><PeriodSelector value={productionPeriod} onChange={setProductionPeriod} /><p className="mb-3 mt-3 text-xs text-[var(--muted)]">Somente medições reais confirmadas. Controles antigos sem separação aparecem apenas no total.</p><TimeSeriesChart data={productionRows} series={[{ key: 'total', label: 'Total', color: '#315c3b', area: true }, { key: 'morning', label: 'Manhã', color: '#b7791f' }, { key: 'afternoon', label: 'Tarde', color: '#3f6f9d', dashed: true }]} label={`Evolução da produção de ${animalName(data)}`} /></SectionCard>
      <SectionCard title="Evolução do peso" icon={Scale} className="lg:col-span-2"><p className="mb-3 text-xs text-[var(--muted)]">Pesagens reais confirmadas; sessões parciais não criam valores nos dias ausentes.</p><TimeSeriesChart data={weightRows} series={[{ key: 'weight', label: 'Peso', color: '#8a5a0a', area: true }]} valueSuffix="kg" startAtZero={false} label={`Evolução do peso de ${animalName(data)}`} /><Link className="button button-secondary mt-3" to="/pesos/importar"><Upload size={17} aria-hidden />Registrar nova pesagem</Link></SectionCard>
      <SectionCard title="Identificação e aliases"><p><strong>Nome:</strong> {data.name ?? 'Não informado'}<br /><strong>Brinco:</strong> {data.tagNumber ?? 'Não informado'}</p>{data.notes && <p className="mt-3 text-sm">{data.notes}</p>}<h3 className="mt-5 text-sm font-bold">Aliases do caderno</h3>{data.aliases.map((item) => <div className="mobile-item" key={item.id}><span>{item.alias}</span><ConfirmButton variant="danger" question={`Remover o alias “${item.alias}”?`} onClick={() => void removeAlias(item.id)}>Remover</ConfirmButton></div>)}<form className="mt-3 flex items-end gap-2" onSubmit={addAlias}><Field label="Novo alias"><Input value={alias} onChange={(event) => setAlias(event.target.value)} required /></Field><Button type="submit">Adicionar</Button></form></SectionCard>
      <SectionCard title="Histórico de controles"><ScrollArea label="Histórico de produção do animal">{!data.history.length ? <p className="text-sm text-[var(--muted)]">Ainda não há medições vinculadas.</p> : data.history.map((row) => <div className="mobile-item" key={row.id}><span><strong>{formatDate(row.sessionDate)}</strong><span className="block text-xs text-[var(--muted)]">{row.status === 'CONFIRMED' ? 'Confirmado' : row.status === 'NEEDS_REVIEW' ? 'Aguardando revisão' : 'Excluído'}</span></span><strong>{formatLiters(row.totalLiters)}</strong></div>)}</ScrollArea></SectionCard>
      <AnimalWeightPanel weights={data.weights} />
    </div>
  </div>;
}
