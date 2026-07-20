import { FormEvent, useState } from 'react';
import { Activity, ArrowLeft, ArrowRightLeft, Banknote, ChartLine, HeartPulse, MapPin, Pencil, Plus, Scale, Tags, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AnimalSex, AnimalStatus } from '../../domain/animal-lifecycle';
import { allowedNextStatuses, animalStatuses, isLiveStatus, statusAllowedForSex, statusRequiresMilkingGroup } from '../../domain/animal-lifecycle';
import { filterByPeriod, type PeriodDays } from '../../domain/analytics';
import { formatDate, formatLiters } from '../../domain/format';
import { formatWeight } from '../../domain/weight';
import { CowHead } from '../components/icons';
import { PeriodSelector } from '../components/PeriodSelector';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { type Attachment } from '../components/AttachmentPanel';
import { useToast } from '../components/feedback-context';
import { ConfirmButton, Modal } from '../components/feedback';
import { Badge, Button, EmptyState, ErrorState, Field, FormErrorSummary, InlineEmpty, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatCard, StatusBadge, SubmitBar, Textarea } from '../components/ui';
import { FilterControls } from '../components/FilterControls';
import { animalStatusDescriptor, milkMeasurementStatusDescriptor, missingGroupDescriptor } from '../lib/status';
import { AnimalGroupChangeForm } from '../features/animals/AnimalGroupChangeForm';
import { AnimalStatusChangeForm } from '../features/animals/AnimalStatusChangeForm';
import { AnimalWeightPanel, type AnimalWeight } from '../features/animals/AnimalWeightPanel';
import { BulkAnimalForm } from '../features/animals/BulkAnimalForm';
import { GroupPicker, type HerdGroup } from '../features/animals/GroupPicker';
import { HerdGroupForm } from '../features/animals/HerdGroupForm';
import { milkingGroupRoutines, nonMilkingGroupRoutines } from '../features/animals/group-routines';
import { ReproductiveEventForm, type ReproductiveEvent } from '../features/animals/ReproductiveEventForm';
import { AnimalCycleSection } from '../features/animals/detail/AnimalCycleSection';
import { AnimalMastitisSection } from '../features/animals/detail/AnimalMastitisSection';
import { AnimalExitsSection } from '../features/animals/detail/AnimalExitsSection';
import { MovePastureForm } from '../features/pastures/MovePastureForm';
import type { PastureSummary } from '../features/pastures/types';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, json } from '../lib/api';
import { animalSexLabels, animalStatusLabels, milkingRoutineLabels, today } from '../lib/labels';

type Alias = { id: string; alias: string };
type CurrentGroup = Pick<HerdGroup, 'id' | 'name' | 'milkingRoutine'>;
type Animal = {
  id: string;
  name: string | null;
  tagNumber: string | null;
  sex: AnimalSex;
  status: AnimalStatus;
  damId: string | null;
  sireId: string | null;
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

/** Linhas reutilizáveis da lista de animais (tabela no desktop, cartões no mobile). */
function AnimalRows({ animals: rows }: { animals: Animal[] }) {
  const groupCell = (animal: Animal) => animal.currentGroup
    ? <span className="text-sm">{animal.currentGroup.name}<span className="block text-xs text-[var(--muted)]">{milkingRoutineLabels[animal.currentGroup.milkingRoutine]}</span></span>
    : <StatusBadge descriptor={missingGroupDescriptor(animal.status)} />;
  return <SectionCard>
    <ScrollArea label="Lista do rebanho" className="max-h-[42rem]">
      <div className="hidden lg:block"><table className="data-table"><thead><tr><th>Animal</th><th>Ciclo</th><th>Lote</th><th>Último controle</th><th>Último peso</th></tr></thead><tbody>{rows.map((animal) => <tr key={animal.id}><td colSpan={5} className="p-0"><Link aria-label={`Abrir histórico de ${animalName(animal)}`} className="grid grid-cols-[1.35fr_1fr_1.2fr_1fr_1fr] items-center gap-3 border-b border-[var(--border)] px-3 py-3 text-[var(--text)] transition hover:bg-[var(--surface-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]" to={`/rebanho/${animal.id}`}><span className="min-w-0"><strong className="text-[var(--primary)]">{animalName(animal)}</strong>{animal.name && animal.tagNumber && <span className="block text-xs text-[var(--muted)]">Brinco {animal.tagNumber}</span>}</span><StatusBadge descriptor={animalStatusDescriptor(animal.status)} />{groupCell(animal)}<span className="text-sm">{animal.latestProduction ? <><strong>{formatLiters(animal.latestProduction.totalLiters)}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(animal.latestProduction.sessionDate)}</span></> : '—'}</span><span className="text-sm">{animal.latestWeight ? <><strong>{formatWeight(animal.latestWeight.weightKg)}</strong><span className="block text-xs text-[var(--muted)]">{new Date(animal.latestWeight.measuredAt).toLocaleDateString('pt-BR')}</span></> : '—'}</span></Link></td></tr>)}</tbody></table></div>
      <div className="lg:hidden">{rows.map((animal) => <Link aria-label={`Abrir histórico de ${animalName(animal)}`} className="block border-b border-[var(--border)] px-1 py-4 text-[var(--text)] transition last:border-b-0 hover:bg-[var(--surface-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" to={`/rebanho/${animal.id}`} key={animal.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-[var(--primary)]">{animalName(animal)}</strong><span className="text-sm text-[var(--muted)]">{animal.currentGroup?.name ?? ''}{animal.name && animal.tagNumber ? `${animal.currentGroup ? ' · ' : ''}Brinco ${animal.tagNumber}` : ''}</span>{!animal.currentGroup && <span className="mt-1 block"><StatusBadge descriptor={missingGroupDescriptor(animal.status)} /></span>}</div><StatusBadge descriptor={animalStatusDescriptor(animal.status)} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><span className="block text-xs text-[var(--muted)]">Último controle</span><strong>{animal.latestProduction ? formatLiters(animal.latestProduction.totalLiters) : 'Sem medição'}</strong></div><div><span className="block text-xs text-[var(--muted)]">Último peso</span><strong>{animal.latestWeight ? formatWeight(animal.latestWeight.weightKg) : 'Sem pesagem'}</strong></div></div></Link>)}</div>
    </ScrollArea>
  </SectionCard>;
}

function matchesAnimalSearch(animal: Animal, normalizedSearch: string) {
  return `${animal.name || ''} ${animal.tagNumber || ''} ${animal.aliases.map((alias) => alias.alias).join(' ')}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
}

/**
 * Tela inicial do rebanho: a porta de entrada é o LOTE, não o animal. Cada
 * cartão traz contagem real (assignments abertos), a rotina do lote e o pasto
 * real que ele ocupa; a busca continua genuína — digitar revela os animais
 * direto.
 */
export function AnimalsPage() {
  const [search, setSearch] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const { data, loading, error, reload } = useResource<Animal[]>('/api/animals');
  const { data: groups, reload: reloadGroups } = useResource<HerdGroup[]>('/api/herd-groups');
  const { data: pastures } = useResource<PastureSummary[]>('/api/pastures');
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const searching = normalizedSearch.length > 0;
  const searchResults = searching ? data?.filter((animal) => matchesAnimalSearch(animal, normalizedSearch)) ?? [] : [];
  const lactating = data?.filter((animal) => animal.status === 'LACTATING').length ?? 0;
  const dry = data?.filter((animal) => animal.status === 'DRY').length ?? 0;
  const heifers = data?.filter((animal) => animal.status === 'HEIFER').length ?? 0;
  const pastureByGroup = new Map((pastures ?? []).filter((pasture) => pasture.currentOccupancy).map((pasture) => [pasture.currentOccupancy!.herdGroupId, pasture]));
  const activeGroups = groups?.filter((group) => group.active) ?? [];
  const countByGroup = new Map<string, number>();
  for (const animal of data ?? []) {
    if (animal.currentGroup) countByGroup.set(animal.currentGroup.id, (countByGroup.get(animal.currentGroup.id) ?? 0) + 1);
  }
  const unassigned = data?.filter((animal) => isLiveStatus(animal.status) && !animal.currentGroup) ?? [];
  const lactatingUnassigned = unassigned.filter((animal) => animal.status === 'LACTATING').length;

  return <div className="page">
    <PageHeader icon={CowHead} title="Rebanho" subtitle="Os lotes do sítio; entre num lote para ver cada animal" action={<div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setShowGroupForm(true)}><Tags size={17} aria-hidden />Criar lote</Button>
      <Link className="button button-primary" to="/rebanho/novo"><Plus size={18} aria-hidden />Cadastrar</Link>
    </div>} />
    <Modal open={showGroupForm} title="Criar lote" onClose={() => setShowGroupForm(false)}>
      <HerdGroupForm onCancel={() => setShowGroupForm(false)} onSaved={async () => { await reloadGroups(); setShowGroupForm(false); }} />
    </Modal>
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Total cadastrado" value={data?.length ?? 0} /><StatCard label="Em lactação" value={lactating} /><StatCard label="Secas" value={dry} /><StatCard label="Novilhas" value={heifers} /></div>
    <FilterControls search={{ value: search, onChange: setSearch, placeholder: 'Nome, brinco ou alias' }} />
    <div className="mt-5">
      {loading ? <SkeletonList rows={6} /> : error ? <ErrorState message={error} retry={reload} /> : searching
        ? (!searchResults.length ? <EmptyState title="Nenhum animal encontrado" description="Ajuste a busca digitada." /> : <AnimalRows animals={searchResults} />)
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeGroups.map((group) => {
            const pasture = pastureByGroup.get(group.id);
            const count = countByGroup.get(group.id) ?? 0;
            return <Link key={group.id} data-testid={`herd-group-card-${group.id}`} className="section-card block text-[var(--text)] transition hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" to={`/rebanho/lote/${group.id}`} aria-label={`Abrir lote ${group.name}`}>
              <div className="flex items-start justify-between gap-2">
                <strong className="text-lg text-[var(--primary)]">{group.name}</strong>
                <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-sm font-bold" data-testid={`herd-group-count-${group.id}`}>{count} {count === 1 ? 'animal' : 'animais'}</span>
              </div>
              <span className="mt-1 block text-sm text-[var(--muted)]">{milkingRoutineLabels[group.milkingRoutine]}</span>
              <span className="mt-3 flex items-center gap-1.5 text-sm" data-testid={`herd-group-pasture-${group.id}`}>
                {pasture
                  ? <><MapPin size={16} aria-hidden className="text-[var(--primary)]" />Pasto: <strong>{pasture.name}</strong></>
                  : <span className="text-[var(--muted)]">Sem pasto</span>}
              </span>
            </Link>;
          })}
          {unassigned.length > 0 && <Link data-testid="herd-group-card-sem-lote" className="section-card block text-[var(--text)] transition hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]" to="/rebanho/lote/sem-lote" aria-label="Abrir animais sem lote">
            <div className="flex items-start justify-between gap-2">
              <strong className="text-lg text-[var(--primary)]">Sem lote</strong>
              <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-sm font-bold" data-testid="herd-group-count-sem-lote">{unassigned.length} {unassigned.length === 1 ? 'animal' : 'animais'}</span>
            </div>
            <span className="mt-1 block text-sm text-[var(--muted)]">Animais vivos sem lote no momento</span>
            {lactatingUnassigned > 0 && <span className="mt-2 block"><Badge tone="warning">{lactatingUnassigned} em lactação precisa{lactatingUnassigned === 1 ? '' : 'm'} de lote</Badge></span>}
          </Link>}
          {!activeGroups.length && !unassigned.length && <div className="sm:col-span-2 lg:col-span-3"><EmptyState title="Nenhum lote cadastrado" description="Cadastre um animal para começar; o lote é criado no cadastro." /></div>}
        </div>}
    </div>
  </div>;
}

/** Animais de um lote específico (ou "Sem lote"): drill-down da tela inicial. */
export function HerdGroupAnimalsPage() {
  const { groupId = '' } = useParams();
  const isUnassigned = groupId === 'sem-lote';
  const [search, setSearch] = useState('');
  const [showPastureForm, setShowPastureForm] = useState(false);
  const { data, loading, error, reload } = useResource<Animal[]>('/api/animals');
  const { data: groups } = useResource<HerdGroup[]>('/api/herd-groups');
  const { data: pastures = [], reload: reloadPastures } = useResource<PastureSummary[]>('/api/pastures');
  const group = groups?.find((item) => item.id === groupId) ?? null;
  const pasture = (pastures ?? []).find((item) => item.currentOccupancy?.herdGroupId === groupId) ?? null;
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const members = data?.filter((animal) => (isUnassigned
    ? isLiveStatus(animal.status) && !animal.currentGroup
    : animal.currentGroup?.id === groupId)) ?? [];
  const filtered = normalizedSearch ? members.filter((animal) => matchesAnimalSearch(animal, normalizedSearch)) : members;
  const title = isUnassigned ? 'Sem lote' : group?.name ?? 'Lote';
  const subtitle = isUnassigned
    ? 'Animais vivos sem lote no momento'
    : group ? `${milkingRoutineLabels[group.milkingRoutine]}${pasture ? ` · Pasto: ${pasture.name}` : ' · Sem pasto'}` : 'Animais deste lote';

  if (!loading && !isUnassigned && groups && !group) return <div className="page"><ErrorState message="Lote não encontrado." /><Link className="button button-secondary mt-4" to="/rebanho"><ArrowLeft size={17} aria-hidden />Voltar para Rebanho</Link></div>;

  return <div className="page">
    <PageHeader icon={CowHead} title={title} subtitle={subtitle} action={<div className="flex flex-wrap gap-2">
      {!isUnassigned && group && <Button variant="secondary" onClick={() => setShowPastureForm(true)}><MapPin size={17} aria-hidden />Mover pasto</Button>}
      <Link className="button button-secondary" to="/rebanho"><ArrowLeft size={17} aria-hidden />Todos os lotes</Link>
    </div>} />
    <Modal open={showPastureForm} title={`Pasto de ${group?.name ?? 'lote'}`} onClose={() => setShowPastureForm(false)}>
      {group && <MovePastureForm group={group} pastures={pastures ?? []} onCancel={() => setShowPastureForm(false)} onSaved={async () => { await reloadPastures(); setShowPastureForm(false); }} />}
    </Modal>
    <FilterControls search={{ value: search, onChange: setSearch, placeholder: 'Nome, brinco ou alias' }} />
    <div className="mt-5" data-testid="herd-group-animals">
      {loading ? <SkeletonList rows={6} /> : error ? <ErrorState message={error} retry={reload} /> : !filtered.length
        ? <EmptyState title="Nenhum animal neste lote" description={normalizedSearch ? 'Ajuste a busca digitada.' : 'Mova animais para este lote pela ficha de cada um.'} />
        : <AnimalRows animals={filtered} />}
    </div>
  </div>;
}

function AnimalForm({ initial, onSaved }: { initial?: AnimalDetail; onSaved?: () => void | Promise<void> }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit();
  const { data: herd = [] } = useResource<Animal[]>('/api/animals');
  const form = useForm(
    {
      name: initial?.name ?? '',
      tagNumber: initial?.tagNumber ?? '',
      sex: 'FEMALE' as AnimalSex,
      status: (initial?.status ?? 'LACTATING') as AnimalStatus,
      groupId: '',
      changedOn: today(),
      damId: '',
      sireId: '',
      notes: initial?.notes ?? '',
    },
    {
      name: (value, all) => (!value.trim() && !all.tagNumber.trim() ? 'Informe o nome ou o número do brinco.' : undefined),
      groupId: (value, all) => (!initial && statusRequiresMilkingGroup(all.status) && !value ? 'Selecione o lote de ordenha.' : undefined),
      changedOn: (value) => (!initial && !value ? 'Informe a data inicial.' : undefined),
    },
  );
  useUnsavedGuard(form.dirty);
  const { sex, status } = form.values;
  const statusOptions = animalStatuses.filter((candidate) => isLiveStatus(candidate) && statusAllowedForSex(candidate, sex));
  const dams = (herd ?? []).filter((animal) => animal.sex === 'FEMALE' && isLiveStatus(animal.status));
  const sires = (herd ?? []).filter((animal) => animal.status === 'BULL');

  function changeSex(next: AnimalSex) {
    form.set('sex', next);
    if (!statusAllowedForSex(form.values.status, next)) {
      const fallback = animalStatuses.find((candidate) => isLiveStatus(candidate) && statusAllowedForSex(candidate, next));
      if (fallback) changeStatus(fallback);
    }
  }

  function changeStatus(next: AnimalStatus) {
    form.set('status', next);
    // Lote escolhido para outra rotina não é reaproveitado (ordenha × sem ordenha).
    form.set('groupId', '');
  }

  async function persist() {
    const { name, tagNumber, sex: animalSexValue, status: statusValue, groupId, changedOn, damId, sireId, notes } = form.values;
    const body = initial
      ? { name: name.trim() || null, tagNumber: tagNumber.trim() || null, notes: notes.trim() || null }
      : { name: name.trim() || null, tagNumber: tagNumber.trim() || null, sex: animalSexValue, status: statusValue, groupId: groupId || null, damId: damId || null, sireId: sireId || null, changedOn, notes: notes.trim() || null };
    const saved = await api<{ id: string }>(initial ? `/api/animals/${initial.id}` : '/api/animals', json(initial ? 'PATCH' : 'POST', body));
    toast(initial ? 'Identificação atualizada' : 'Animal cadastrado');
    if (initial && onSaved) await onSaved(); else navigate(`/rebanho/${saved.id}`);
  }

  return <form className="page-narrow grid gap-5" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <SectionCard><div className="grid gap-4">
      <Field label="Nome" hint="Informe o nome ou o brinco." error={form.error('name')}><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} onBlur={() => form.blur('name')} autoFocus /></Field>
      <Field label="Número do brinco" hint="Pode ser usado no lugar do nome."><Input inputMode="numeric" value={form.values.tagNumber} onChange={(event) => { form.set('tagNumber', event.target.value); form.blur('name'); }} /></Field>
      {!initial && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sexo"><Select value={sex} onChange={(event) => changeSex(event.target.value as AnimalSex)} required>{Object.entries(animalSexLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="Situação inicial"><Select value={status} onChange={(event) => changeStatus(event.target.value as AnimalStatus)}>{statusOptions.map((value) => <option key={value} value={value}>{animalStatusLabels[value]}</option>)}</Select></Field>
        </div>
        <Field label="Data inicial" error={form.error('changedOn')}><Input type="date" value={form.values.changedOn} max={today()} onChange={(event) => form.set('changedOn', event.target.value)} onBlur={() => form.blur('changedOn')} required /></Field>
        {statusRequiresMilkingGroup(status)
          ? <GroupPicker label="Lote de ordenha" routines={milkingGroupRoutines} value={form.values.groupId} fieldError={form.error('groupId')} onChange={(value) => form.set('groupId', value)} />
          : <GroupPicker label="Lote (sem ordenha)" routines={nonMilkingGroupRoutines} required={false} value={form.values.groupId} fieldError={form.error('groupId')} onChange={(value) => form.set('groupId', value)} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mãe (opcional)" hint="Somente fêmeas vivas do rebanho."><Select value={form.values.damId} onChange={(event) => form.set('damId', event.target.value)}><option value="">Não informada</option>{dams.map((animal) => <option key={animal.id} value={animal.id}>{animalName(animal)}</option>)}</Select></Field>
          <Field label="Pai (opcional)" hint="Somente touros vivos do rebanho."><Select value={form.values.sireId} onChange={(event) => form.set('sireId', event.target.value)}><option value="">Não informado</option>{sires.map((animal) => <option key={animal.id} value={animal.id}>{animalName(animal)}</option>)}</Select></Field>
        </div>
      </>}
      <Field label="Observações"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field>
    </div></SectionCard>
    <SubmitBar label={initial ? 'Salvar alterações' : 'Salvar animal'} busy={busy} />
  </form>;
}

export function NewAnimalPage() {
  const [mode, setMode] = useState<'ONE' | 'MANY'>('ONE');
  const navigate = useNavigate();
  return <div className="page"><PageHeader icon={CowHead} title="Cadastrar rebanho" subtitle="Cadastre um animal ou uma lista com sexo, situação e lote em comum" /><div className="mb-5 flex gap-2"><Button variant={mode === 'ONE' ? 'primary' : 'secondary'} onClick={() => setMode('ONE')}>Um animal</Button><Button variant={mode === 'MANY' ? 'primary' : 'secondary'} onClick={() => setMode('MANY')}>Vários animais</Button></div>{mode === 'ONE' ? <AnimalForm /> : <BulkAnimalForm onSaved={(firstId) => navigate(firstId ? `/rebanho/${firstId}` : '/rebanho')} />}</div>;
}

export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useResource<AnimalDetail>(`/api/animals/${id}`);
  const { data: herd = [] } = useResource<Animal[]>('/api/animals');
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
  const herdById = new Map((herd ?? []).map((animal) => [animal.id, animal]));
  const offspring = (herd ?? []).filter((animal) => animal.damId === id || animal.sireId === id);
  const dam = data.damId ? herdById.get(data.damId) ?? null : null;
  const sire = data.sireId ? herdById.get(data.sireId) ?? null : null;
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
    <Modal open={showGroupForm} title="Mudar lote" onClose={() => setShowGroupForm(false)}>
      <AnimalGroupChangeForm animalId={id} status={data.status} currentGroupId={data.currentGroup?.id} onCancel={() => setShowGroupForm(false)} onSaved={async () => { await reload(); setShowGroupForm(false); }} />
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
    <SectionCard title="Ações do animal" className="mb-5"><div className="flex flex-wrap gap-2"><Link className="button button-primary" to={`/mastite/nova?animalId=${id}`}><Activity size={17} aria-hidden />Registrar mastite</Link><Link className="button button-secondary" to="/pesos/novo"><Scale size={17} aria-hidden />Registrar peso</Link><Button variant="secondary" onClick={() => { setEditingReproductiveEvent(undefined); setShowReproductiveForm(true); }}><HeartPulse size={17} aria-hidden />Registrar cio/cobertura</Button>{allowedNextStatuses(data.status).length > 0 && <Button variant="secondary" onClick={() => { setStatusFormTarget(undefined); setShowStatusForm(true); }}>Alterar situação</Button>}{isLiveStatus(data.status) && <Button variant="secondary" onClick={() => setShowGroupForm(true)}><ArrowRightLeft size={17} aria-hidden />Mudar lote</Button>}{allowedNextStatuses(data.status).includes('SOLD') && <Button variant="secondary" onClick={() => { setStatusFormTarget('SOLD'); setShowStatusForm(true); }}><Banknote size={17} aria-hidden />Registrar saída</Button>}</div></SectionCard>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Situação atual" value={<StatusBadge descriptor={animalStatusDescriptor(data.status)} />} detail={latestStatus ? `Desde ${formatDate(latestStatus.changedOn)}` : undefined} /><StatCard label="Reprodução" value={reproductiveState} detail={data.reproductiveSummary.lastHeatOn ? `Último cio em ${formatDate(data.reproductiveSummary.lastHeatOn)}` : 'Registre somente fatos observados'} /><StatCard label="Lote" value={data.currentGroup?.name ?? 'Sem lote'} detail={data.currentGroup ? milkingRoutineLabels[data.currentGroup.milkingRoutine] : data.status === 'LACTATING' ? 'Precisa de atenção' : 'Fora da lactação'} /><StatCard label="Último controle" value={latestProduction ? formatLiters(latestProduction.totalLiters) : '—'} detail={latestProduction ? formatDate(latestProduction.sessionDate) : 'Sem medição individual'} /><StatCard label="Último peso" value={latestWeight?.weightKg ? formatWeight(latestWeight.weightKg) : '—'} detail={latestWeight ? new Date(latestWeight.measuredAt).toLocaleDateString('pt-BR') : 'Sem pesagem'} /></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <AnimalCycleSection data={data} resolveAnimalName={(animalId) => { const found = herdById.get(animalId); return found ? animalName(found) : undefined; }} onChangeStatus={() => { setStatusFormTarget(undefined); setShowStatusForm(true); }} onRegisterReproductiveEvent={() => { setEditingReproductiveEvent(undefined); setShowReproductiveForm(true); }} onEditReproductiveEvent={(event) => { setEditingReproductiveEvent(event); setShowReproductiveForm(true); }} onUndoStatus={(eventId) => void undoStatus(eventId)} onRemoveReproductiveEvent={(eventId) => void removeReproductiveEvent(eventId)} />
      <SectionCard title="Lote" icon={Tags}><p className="text-sm">{data.currentGroup ? <>Atual: <strong>{data.currentGroup.name}</strong><span className="block text-[var(--muted)]">{milkingRoutineLabels[data.currentGroup.milkingRoutine]}</span></> : data.status === 'LACTATING' ? 'Sem lote — vaca em lactação precisa de um lote com ordenha.' : 'Fora da lactação, a vaca pode ocupar um lote sem ordenha.'}</p>{isLiveStatus(data.status) && <Button className="mt-4" variant="secondary" onClick={() => setShowGroupForm(true)}><ArrowRightLeft size={17} aria-hidden />Mudar lote</Button>}<h3 className="mt-5 text-sm font-bold">Histórico de lotes</h3>{!data.groupHistory.length ? <InlineEmpty className="mt-2">Nenhum lote registrado.</InlineEmpty> :<ScrollArea label="Histórico de lotes do animal" className="mt-2 max-h-64">{data.groupHistory.map((row) => <div className="mobile-item" key={row.id}><span><strong>{row.groupName}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(row.startedOn)}{row.endedOn ? ` até ${formatDate(row.endedOn)}` : ' até hoje'}</span>{row.notes && <span className="block text-xs text-[var(--muted)]">{row.notes}</span>}</span></div>)}</ScrollArea>}</SectionCard>
      <AnimalMastitisSection data={data} animalId={id} />
      <SectionCard title="Evolução da produção" icon={ChartLine} className="lg:col-span-2"><PeriodSelector value={productionPeriod} onChange={setProductionPeriod} /><p className="mb-3 mt-3 text-xs text-[var(--muted)]">Somente medições reais confirmadas. Controles antigos sem separação aparecem apenas no total.</p><TimeSeriesChart data={productionRows} series={[{ key: 'total', label: 'Total', color: '#315c3b', area: true }, { key: 'morning', label: 'Manhã', color: '#b7791f' }, { key: 'afternoon', label: 'Tarde', color: '#3f6f9d', dashed: true }]} label={`Evolução da produção de ${animalName(data)}`} /></SectionCard>
      <SectionCard title="Evolução do peso" icon={Scale} className="lg:col-span-2"><p className="mb-3 text-xs text-[var(--muted)]">Pesagens reais confirmadas; sessões parciais não criam valores nos dias ausentes.</p><TimeSeriesChart data={weightRows} series={[{ key: 'weight', label: 'Peso', color: '#8a5a0a', area: true }]} valueSuffix="kg" startAtZero={false} label={`Evolução do peso de ${animalName(data)}`} /><Link className="button button-secondary mt-3" to="/pesos/novo"><Upload size={17} aria-hidden />Registrar nova pesagem</Link></SectionCard>
      {(data.exits.length > 0 || data.revenues.length > 0) && <AnimalExitsSection data={data} onChange={reload} />}
      <SectionCard title="Identificação e aliases" action={<Button variant="secondary" onClick={() => setShowAliasModal(true)}><Pencil size={16} aria-hidden />Gerenciar aliases</Button>}><p><strong>Nome:</strong> {data.name ?? 'Não informado'}<br /><strong>Brinco:</strong> {data.tagNumber ?? 'Não informado'}<br /><strong>Sexo:</strong> {animalSexLabels[data.sex] ?? data.sex}<br /><strong>Mãe:</strong> {dam ? <Link className="text-[var(--primary)] underline" to={`/rebanho/${dam.id}`}>{animalName(dam)}</Link> : data.damId ? '…' : 'Não informada'}<br /><strong>Pai:</strong> {sire ? <Link className="text-[var(--primary)] underline" to={`/rebanho/${sire.id}`}>{animalName(sire)}</Link> : data.sireId ? '…' : 'Não informado'}</p>{data.notes && <p className="mt-3 text-sm">{data.notes}</p>}<h3 className="mt-5 text-sm font-bold">Aliases do caderno</h3>{!data.aliases.length ? <InlineEmpty className="mt-1">Nenhum alias cadastrado.</InlineEmpty> : <p className="mt-1 text-sm text-[var(--muted)]">{data.aliases.map((item) => item.alias).join(', ')}</p>}</SectionCard>
      {offspring.length > 0 && <SectionCard title={`Crias de ${animalName(data)}`}>{offspring.map((calf) => <Link key={calf.id} className="mobile-item text-[var(--text)]" to={`/rebanho/${calf.id}`}><span className="min-w-0"><strong className="block truncate text-[var(--primary)]">{animalName(calf)}</strong><span className="block text-xs text-[var(--muted)]">{animalSexLabels[calf.sex] ?? calf.sex}{calf.damId === id && calf.sireId === id ? ' · mãe e pai declarados' : calf.damId === id ? ' · mãe declarada' : ' · pai declarado'}</span></span><StatusBadge descriptor={animalStatusDescriptor(calf.status)} /></Link>)}</SectionCard>}
      <SectionCard title="Histórico de controles"><ScrollArea label="Histórico de produção do animal">{!data.history.length ? <InlineEmpty>Ainda não há medições vinculadas.</InlineEmpty> : data.history.map((row) => <div className="mobile-item" key={row.id}><span><strong>{formatDate(row.sessionDate)}</strong><span className="block text-xs text-[var(--muted)]">{milkMeasurementStatusDescriptor[row.status].label}</span></span><strong>{formatLiters(row.totalLiters)}</strong></div>)}</ScrollArea></SectionCard>
      <AnimalWeightPanel weights={data.weights} />
    </div>
  </div>;
}
