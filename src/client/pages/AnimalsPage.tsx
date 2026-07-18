import { FormEvent, useState } from 'react';
import { Activity, ArrowRightLeft, Banknote, ChartLine, HeartPulse, Pencil, Plus, Scale, Tags, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AnimalStatus } from '../../domain/animal-lifecycle';
import { allowedNextStatuses, statusRequiresMilkingGroup } from '../../domain/animal-lifecycle';
import { filterByPeriod, type PeriodDays } from '../../domain/analytics';
import { formatDate, formatLiters } from '../../domain/format';
import { formatWeight } from '../../domain/weight';
import { CowHead } from '../components/icons';
import { PeriodSelector } from '../components/PeriodSelector';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { type Attachment } from '../components/AttachmentPanel';
import { useToast } from '../components/feedback-context';
import { ConfirmButton, Modal } from '../components/feedback';
import { Button, EmptyState, ErrorState, Field, FormErrorSummary, InlineEmpty, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatCard, StatusBadge, Textarea } from '../components/ui';
import { FilterControls } from '../components/FilterControls';
import { animalStatusDescriptor, milkMeasurementStatusDescriptor } from '../lib/status';
import { AnimalGroupChangeForm } from '../features/animals/AnimalGroupChangeForm';
import { AnimalStatusChangeForm } from '../features/animals/AnimalStatusChangeForm';
import { AnimalWeightPanel, type AnimalWeight } from '../features/animals/AnimalWeightPanel';
import { BulkAnimalForm } from '../features/animals/BulkAnimalForm';
import { GroupPicker, type HerdGroup } from '../features/animals/GroupPicker';
import { ReproductiveEventForm, type ReproductiveEvent } from '../features/animals/ReproductiveEventForm';
import { AnimalCycleSection } from '../features/animals/detail/AnimalCycleSection';
import { AnimalMastitisSection } from '../features/animals/detail/AnimalMastitisSection';
import { AnimalExitsSection } from '../features/animals/detail/AnimalExitsSection';
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
type AnimalMastitisCase = { id: string; detectedAt: string; status: string; observedSigns: string | null; withdrawalEndsAt: string | null; milkDiscardRequired: boolean; actions: Array<{ id: string; scheduledFor: string; actionDescription: string; completedAt: string | null; cancelledAt: string | null }> };
type AnimalExit = { id: string; status: string; changedOn: string; exitType: string | null; reason: string | null; buyerName: string | null; weightKg: string | null; amount: string | null; revenueId: string | null; notes: string | null; attachments: Attachment[] };
type AnimalRevenue = { id: string; revenueDate: string; description: string; amount: string; status: string };
export type AnimalDetail = Omit<Animal, 'latestWeight' | 'latestProduction'> & {
  weights: AnimalWeight[];
  history: Array<{ id: string; sessionDate: string; morningLiters: string | null; afternoonLiters: string | null; totalLiters: string; status: string }>;
  groupHistory: GroupHistory[];
  statusHistory: StatusHistory[];
  reproductiveEvents: ReproductiveEvent[];
  reproductiveSummary: { lastCalvingOn: string | null; lastHeatOn: string | null; attemptsInCurrentCycle: number; pendingAttempts: number; lastPregnancyOn: string | null; attemptsUntilLastPregnancy: number | null };
  mastitisCases: AnimalMastitisCase[];
  exits: AnimalExit[];
  revenues: AnimalRevenue[];
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
    <FilterControls
      search={{ value: search, onChange: setSearch, placeholder: 'Nome, brinco ou alias' }}
      selects={[
        { label: 'Situação', value: status, onChange: setStatus, options: [{ value: 'ALL', label: 'Todas' }, ...Object.entries(animalStatusLabels).map(([value, label]) => ({ value, label }))] },
        { label: 'Lote', value: groupId, onChange: setGroupId, options: [{ value: 'ALL', label: 'Todos' }, ...(groups?.filter((group) => group.active).map((group) => ({ value: group.id, label: group.name })) ?? [])] },
        { label: 'Atenção', value: attention, onChange: setAttention, options: [{ value: 'ALL', label: 'Todos os registros' }, { value: 'NO_GROUP', label: 'Em lactação sem lote' }, { value: 'NO_WEIGHT', label: 'Sem pesagem' }, { value: 'NO_PRODUCTION', label: 'Sem controle individual' }] },
      ]}
    />
    <div className="mt-5">{loading ? <SkeletonList rows={6} /> : error ? <ErrorState message={error} retry={reload} /> : !filtered.length ? <EmptyState title="Nenhum animal encontrado" description="Ajuste a busca ou os filtros aplicados." /> : <SectionCard>
      <ScrollArea label="Lista do rebanho" className="max-h-[42rem]">
        <div className="hidden lg:block"><table className="data-table"><thead><tr><th>Animal</th><th>Ciclo</th><th>Lote de ordenha</th><th>Último controle</th><th>Último peso</th></tr></thead><tbody>{filtered.map((animal) => <tr key={animal.id}><td colSpan={5} className="p-0"><Link aria-label={`Abrir histórico de ${animalName(animal)}`} className="grid grid-cols-[1.35fr_1fr_1.2fr_1fr_1fr] items-center gap-3 border-b border-[var(--border)] px-3 py-3 text-[var(--text)] transition hover:bg-[var(--surface-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]" to={`/rebanho/${animal.id}`}><span className="min-w-0"><strong className="text-[var(--primary)]">{animalName(animal)}</strong>{animal.name && animal.tagNumber && <span className="block text-xs text-[var(--muted)]">Brinco {animal.tagNumber}</span>}</span><StatusBadge descriptor={animalStatusDescriptor(animal.status)} /><span className="text-sm">{animal.currentGroup?.name ?? '—'}{animal.currentGroup && <span className="block text-xs text-[var(--muted)]">{milkingRoutineLabels[animal.currentGroup.milkingRoutine]}</span>}</span><span className="text-sm">{animal.latestProduction ? <><strong>{formatLiters(animal.latestProduction.totalLiters)}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(animal.latestProduction.sessionDate)}</span></> : '—'}</span><span className="text-sm">{animal.latestWeight ? <><strong>{formatWeight(animal.latestWeight.weightKg)}</strong><span className="block text-xs text-[var(--muted)]">{new Date(animal.latestWeight.measuredAt).toLocaleDateString('pt-BR')}</span></> : '—'}</span></Link></td></tr>)}</tbody></table></div>
        <div className="lg:hidden">{filtered.map((animal) => <Link aria-label={`Abrir histórico de ${animalName(animal)}`} className="block border-b border-[var(--border)] px-1 py-4 text-[var(--text)] transition last:border-b-0 hover:bg-[var(--surface-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" to={`/rebanho/${animal.id}`} key={animal.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-[var(--primary)]">{animalName(animal)}</strong><span className="text-sm text-[var(--muted)]">{animal.currentGroup?.name ?? (animal.status === 'LACTATING' ? 'Sem lote' : 'Fora da ordenha')}{animal.name && animal.tagNumber ? ` · Brinco ${animal.tagNumber}` : ''}</span></div><StatusBadge descriptor={animalStatusDescriptor(animal.status)} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><span className="block text-xs text-[var(--muted)]">Último controle</span><strong>{animal.latestProduction ? formatLiters(animal.latestProduction.totalLiters) : 'Sem medição'}</strong></div><div><span className="block text-xs text-[var(--muted)]">Último peso</span><strong>{animal.latestWeight ? formatWeight(animal.latestWeight.weightKg) : 'Sem pesagem'}</strong></div></div></Link>)}</div>
      </ScrollArea>
    </SectionCard>}</div>
  </div>;
}

function AnimalForm({ initial, onSaved }: { initial?: AnimalDetail; onSaved?: () => void | Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name || '');
  const [tagNumber, setTagNumber] = useState(initial?.tagNumber || '');
  const [status, setStatus] = useState<AnimalStatus>(initial?.status || 'LACTATING');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [groupId, setGroupId] = useState(initial?.currentGroup?.id || '');
  const [changedOn, setChangedOn] = useState(today());
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ identity?: string; group?: string; date?: string }>({});
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const nextErrors = {
      identity: !name.trim() && !tagNumber.trim() ? 'Informe o nome ou o número do brinco.' : undefined,
      group: !initial && statusRequiresMilkingGroup(status) && !groupId ? 'Selecione o lote de ordenha.' : undefined,
      date: !initial && !changedOn ? 'Informe a data inicial.' : undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.identity || nextErrors.group || nextErrors.date) return;
    setBusy(true);
    try {
      const body = { name: name.trim() || null, tagNumber: tagNumber.trim() || null, notes: notes.trim() || null, ...(!initial ? { status, groupId: statusRequiresMilkingGroup(status) ? groupId : null, changedOn } : {}) };
      const saved = await api<{ id: string }>(initial ? `/api/animals/${initial.id}` : '/api/animals', json(initial ? 'PATCH' : 'POST', body));
      toast(initial ? 'Identificação atualizada' : 'Animal cadastrado');
      if (initial && onSaved) await onSaved(); else navigate(`/rebanho/${saved.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <form className="page-narrow grid gap-5" noValidate onSubmit={submit}>{error && <ErrorState message={error} />}<FormErrorSummary errors={Object.values(fieldErrors)} /><SectionCard><div className="grid gap-4"><Field label="Nome" hint="Informe o nome ou o brinco." error={fieldErrors.identity}><Input value={name} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, identity: undefined })); }} /></Field><Field label="Número do brinco" hint="Pode ser usado no lugar do nome."><Input inputMode="numeric" value={tagNumber} onChange={(event) => { setTagNumber(event.target.value); setFieldErrors((current) => ({ ...current, identity: undefined })); }} /></Field>{!initial && <><div className="grid gap-3 sm:grid-cols-2"><Field label="Situação inicial"><Select value={status} onChange={(event) => setStatus(event.target.value as AnimalStatus)}>{Object.entries(animalStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Data inicial" error={fieldErrors.date}><Input type="date" value={changedOn} max={today()} onChange={(event) => { setChangedOn(event.target.value); setFieldErrors((current) => ({ ...current, date: undefined })); }} required /></Field></div>{statusRequiresMilkingGroup(status) && <GroupPicker label="Lote de ordenha" value={groupId} fieldError={fieldErrors.group} onChange={(value) => { setGroupId(value); setFieldErrors((current) => ({ ...current, group: undefined })); }} />}</>}<Field label="Observações"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div></SectionCard><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar animal'}</Button></form>;
}

export function NewAnimalPage() {
  const [mode, setMode] = useState<'ONE' | 'MANY'>('ONE');
  const navigate = useNavigate();
  return <div className="page"><PageHeader icon={CowHead} title="Cadastrar rebanho" subtitle="Cadastre uma vaca ou uma lista com situação e lote em comum" /><div className="mb-5 flex gap-2"><Button variant={mode === 'ONE' ? 'primary' : 'secondary'} onClick={() => setMode('ONE')}>Um animal</Button><Button variant={mode === 'MANY' ? 'primary' : 'secondary'} onClick={() => setMode('MANY')}>Vários animais</Button></div>{mode === 'ONE' ? <AnimalForm /> : <BulkAnimalForm onSaved={(firstId) => navigate(firstId ? `/rebanho/${firstId}` : '/rebanho')} />}</div>;
}

export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useResource<AnimalDetail>(`/api/animals/${id}`);
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState('');
  const [actionError, setActionError] = useState('');
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [statusFormTarget, setStatusFormTarget] = useState<AnimalStatus | undefined>();
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showReproductiveForm, setShowReproductiveForm] = useState(false);
  const [editingReproductiveEvent, setEditingReproductiveEvent] = useState<ReproductiveEvent | undefined>();
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [productionPeriod, setProductionPeriod] = useState<PeriodDays>(180);
  const [deleting, setDeleting] = useState(false);
  async function addAlias(event: FormEvent) { event.preventDefault(); setActionError(''); try { await api(`/api/animals/${id}/aliases`, json('POST', { alias })); setAlias(''); reload(); toast('Alias adicionado'); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível adicionar.'); } }
  async function removeAlias(aliasId: string) { try { await api(`/api/animal-aliases/${aliasId}`, { method: 'DELETE' }); reload(); toast('Alias removido'); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível remover.'); } }
  async function removeReproductiveEvent(eventId: string) { try { await api(`/api/animals/${id}/reproductive-events/${eventId}`, { method: 'DELETE' }); await reload(); toast('Registro de cio excluído'); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir o registro.'); } }
  async function undoStatus(eventId: string) { try { await api(`/api/animals/${id}/status-changes/${eventId}`, { method: 'DELETE' }); setShowStatusForm(false); await reload(); toast('Última situação desfeita'); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível desfazer a mudança.'); } }
  async function removeAnimal() {
    setActionError(''); setDeleting(true);
    try {
      const result = await api<{ deletedMeasurements: number }>(`/api/animals/${id}`, { method: 'DELETE' });
      const message = result.deletedMeasurements === 1
        ? '1 controle individual também foi excluído.'
        : result.deletedMeasurements > 1 ? `${result.deletedMeasurements} controles individuais também foram excluídos.` : 'Nenhum controle individual estava vinculado.';
      toast({ title: 'Animal excluído', message });
      navigate('/rebanho');
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir o animal.'); }
    finally { setDeleting(false); }
  }
  if (loading) return <div className="page"><SkeletonList rows={5} /></div>;
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
  const measurementCount = data.history.length;
  const measurementLabel = measurementCount === 1 ? '1 controle individual' : `${measurementCount} controles individuais`;
  const deletionDescription = `${measurementCount ? `O cadastro de ${animalName(data)} e ${measurementLabel} serão excluídos definitivamente.` : `O cadastro de ${animalName(data)} será excluído definitivamente.`} Totais diários do rebanho, coletas e pesagens não serão apagados.`;
  return <div className="page"><PageHeader icon={CowHead} title={animalName(data)} subtitle={data.name && data.tagNumber ? `Brinco ${data.tagNumber}` : 'Histórico completo do animal'} action={<div className="flex flex-wrap gap-2"><Button onClick={() => setEditing(true)}><Pencil size={17} aria-hidden />Editar identificação</Button><ConfirmButton variant="danger" disabled={deleting} title="Excluir animal e seus controles?" confirmLabel="Excluir animal" question={deletionDescription} onClick={() => void removeAnimal()}><Trash2 size={17} aria-hidden />{deleting ? 'Excluindo…' : 'Excluir animal'}</ConfirmButton></div>} />
    {actionError && <div className="mb-5"><ErrorState message={actionError} /></div>}
    <Modal open={showStatusForm} title="Alterar situação" onClose={() => setShowStatusForm(false)}>
      <AnimalStatusChangeForm animalId={id} currentStatus={data.status} initialStatus={statusFormTarget} onCancel={() => setShowStatusForm(false)} onSaved={async () => { await reload(); setShowStatusForm(false); }} />
    </Modal>
    <Modal open={showGroupForm} title="Mudar lote de ordenha" onClose={() => setShowGroupForm(false)}>
      <AnimalGroupChangeForm animalId={id} currentGroupId={data.currentGroup?.id} onCancel={() => setShowGroupForm(false)} onSaved={async () => { await reload(); setShowGroupForm(false); }} />
    </Modal>
    <Modal open={showReproductiveForm} title={editingReproductiveEvent ? 'Editar cio/cobertura' : 'Registrar cio/cobertura'} onClose={() => { setShowReproductiveForm(false); setEditingReproductiveEvent(undefined); }}>
      <ReproductiveEventForm animalId={id} initial={editingReproductiveEvent} onCancel={() => { setShowReproductiveForm(false); setEditingReproductiveEvent(undefined); }} onSaved={async () => { await reload(); setShowReproductiveForm(false); setEditingReproductiveEvent(undefined); }} />
    </Modal>
    <Modal open={showAliasModal} title="Aliases do caderno" description="Nomes alternativos usados na transcrição para casar este animal." onClose={() => setShowAliasModal(false)}>
      <div className="grid gap-3">
        {!data.aliases.length ? <InlineEmpty>Nenhum alias cadastrado.</InlineEmpty> : data.aliases.map((item) => <div className="mobile-item" key={item.id}><span>{item.alias}</span><ConfirmButton variant="danger" question={`Remover o alias “${item.alias}”?`} onClick={() => void removeAlias(item.id)}>Remover</ConfirmButton></div>)}
        <form className="flex items-end gap-2" onSubmit={addAlias}><Field label="Novo alias"><Input value={alias} onChange={(event) => setAlias(event.target.value)} required /></Field><Button type="submit">Adicionar</Button></form>
      </div>
    </Modal>
    <SectionCard title="Ações do animal" className="mb-5"><div className="flex flex-wrap gap-2"><Link className="button button-primary" to={`/mastite/nova?animalId=${id}`}><Activity size={17} aria-hidden />Registrar mastite</Link><Link className="button button-secondary" to="/pesos/novo"><Scale size={17} aria-hidden />Registrar peso</Link><Button variant="secondary" onClick={() => { setEditingReproductiveEvent(undefined); setShowReproductiveForm(true); }}><HeartPulse size={17} aria-hidden />Registrar cio/cobertura</Button>{allowedNextStatuses(data.status).length > 0 && <Button variant="secondary" onClick={() => { setStatusFormTarget(undefined); setShowStatusForm(true); }}>Alterar situação</Button>}{data.status === 'LACTATING' && <Button variant="secondary" onClick={() => setShowGroupForm(true)}><ArrowRightLeft size={17} aria-hidden />Mudar lote</Button>}{allowedNextStatuses(data.status).includes('SOLD') && <Button variant="secondary" onClick={() => { setStatusFormTarget('SOLD'); setShowStatusForm(true); }}><Banknote size={17} aria-hidden />Registrar saída</Button>}</div></SectionCard>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Situação atual" value={<StatusBadge descriptor={animalStatusDescriptor(data.status)} />} detail={latestStatus ? `Desde ${formatDate(latestStatus.changedOn)}` : undefined} /><StatCard label="Reprodução" value={reproductiveState} detail={data.reproductiveSummary.lastHeatOn ? `Último cio em ${formatDate(data.reproductiveSummary.lastHeatOn)}` : 'Registre somente fatos observados'} /><StatCard label="Lote de ordenha" value={data.currentGroup?.name ?? (data.status === 'LACTATING' ? 'Sem lote' : 'Não se aplica')} detail={data.currentGroup ? milkingRoutineLabels[data.currentGroup.milkingRoutine] : data.status === 'LACTATING' ? 'Precisa de atenção' : 'Fora da lactação'} /><StatCard label="Último controle" value={latestProduction ? formatLiters(latestProduction.totalLiters) : '—'} detail={latestProduction ? formatDate(latestProduction.sessionDate) : 'Sem medição individual'} /><StatCard label="Último peso" value={latestWeight?.weightKg ? formatWeight(latestWeight.weightKg) : '—'} detail={latestWeight ? new Date(latestWeight.measuredAt).toLocaleDateString('pt-BR') : 'Sem pesagem'} /></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <AnimalCycleSection data={data} onChangeStatus={() => { setStatusFormTarget(undefined); setShowStatusForm(true); }} onRegisterReproductiveEvent={() => { setEditingReproductiveEvent(undefined); setShowReproductiveForm(true); }} onEditReproductiveEvent={(event) => { setEditingReproductiveEvent(event); setShowReproductiveForm(true); }} onUndoStatus={(eventId) => void undoStatus(eventId)} onRemoveReproductiveEvent={(eventId) => void removeReproductiveEvent(eventId)} />
      <SectionCard title="Lote de ordenha" icon={Tags}><p className="text-sm">{data.status !== 'LACTATING' ? 'Fora da lactação, a vaca não pertence a um lote de ordenha.' : <>Atual: <strong>{data.currentGroup?.name ?? 'Sem lote'}</strong>{data.currentGroup && <span className="block text-[var(--muted)]">{milkingRoutineLabels[data.currentGroup.milkingRoutine]}</span>}</>}</p>{data.status === 'LACTATING' && <Button className="mt-4" variant="secondary" onClick={() => setShowGroupForm(true)}><ArrowRightLeft size={17} aria-hidden />Mudar lote</Button>}<h3 className="mt-5 text-sm font-bold">Histórico de lotes</h3>{!data.groupHistory.length ? <InlineEmpty className="mt-2">Nenhum lote registrado.</InlineEmpty> :<ScrollArea label="Histórico de lotes de ordenha" className="mt-2 max-h-64">{data.groupHistory.map((row) => <div className="mobile-item" key={row.id}><span><strong>{row.groupName}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(row.startedOn)}{row.endedOn ? ` até ${formatDate(row.endedOn)}` : ' até hoje'}</span>{row.notes && <span className="block text-xs text-[var(--muted)]">{row.notes}</span>}</span></div>)}</ScrollArea>}</SectionCard>
      <AnimalMastitisSection data={data} animalId={id} />
      <SectionCard title="Evolução da produção" icon={ChartLine} className="lg:col-span-2"><PeriodSelector value={productionPeriod} onChange={setProductionPeriod} /><p className="mb-3 mt-3 text-xs text-[var(--muted)]">Somente medições reais confirmadas. Controles antigos sem separação aparecem apenas no total.</p><TimeSeriesChart data={productionRows} series={[{ key: 'total', label: 'Total', color: '#315c3b', area: true }, { key: 'morning', label: 'Manhã', color: '#b7791f' }, { key: 'afternoon', label: 'Tarde', color: '#3f6f9d', dashed: true }]} label={`Evolução da produção de ${animalName(data)}`} /></SectionCard>
      <SectionCard title="Evolução do peso" icon={Scale} className="lg:col-span-2"><p className="mb-3 text-xs text-[var(--muted)]">Pesagens reais confirmadas; sessões parciais não criam valores nos dias ausentes.</p><TimeSeriesChart data={weightRows} series={[{ key: 'weight', label: 'Peso', color: '#8a5a0a', area: true }]} valueSuffix="kg" startAtZero={false} label={`Evolução do peso de ${animalName(data)}`} /><Link className="button button-secondary mt-3" to="/pesos/novo"><Upload size={17} aria-hidden />Registrar nova pesagem</Link></SectionCard>
      {(data.exits.length > 0 || data.revenues.length > 0) && <AnimalExitsSection data={data} onChange={reload} />}
      <SectionCard title="Identificação e aliases" action={<Button variant="secondary" onClick={() => setShowAliasModal(true)}><Pencil size={16} aria-hidden />Gerenciar aliases</Button>}><p><strong>Nome:</strong> {data.name ?? 'Não informado'}<br /><strong>Brinco:</strong> {data.tagNumber ?? 'Não informado'}</p>{data.notes && <p className="mt-3 text-sm">{data.notes}</p>}<h3 className="mt-5 text-sm font-bold">Aliases do caderno</h3>{!data.aliases.length ? <InlineEmpty className="mt-1">Nenhum alias cadastrado.</InlineEmpty> : <p className="mt-1 text-sm text-[var(--muted)]">{data.aliases.map((item) => item.alias).join(', ')}</p>}</SectionCard>
      <SectionCard title="Histórico de controles"><ScrollArea label="Histórico de produção do animal">{!data.history.length ? <InlineEmpty>Ainda não há medições vinculadas.</InlineEmpty> : data.history.map((row) => <div className="mobile-item" key={row.id}><span><strong>{formatDate(row.sessionDate)}</strong><span className="block text-xs text-[var(--muted)]">{milkMeasurementStatusDescriptor[row.status].label}</span></span><strong>{formatLiters(row.totalLiters)}</strong></div>)}</ScrollArea></SectionCard>
      <AnimalWeightPanel weights={data.weights} />
    </div>
  </div>;
}
