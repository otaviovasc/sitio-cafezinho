import { useNavigate } from 'react-router-dom';
import type { AnimalSex, AnimalStatus } from '../../../domain/animal-lifecycle';
import { animalStatuses, isLiveStatus, statusAllowedForSex, statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { useToast } from '../../components/feedback-context';
import { ErrorState, Field, FormErrorSummary, Input, SectionCard, Select, SubmitBar, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { animalSexLabels, animalStatusLabels, today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';
import { milkingGroupRoutines, nonMilkingGroupRoutines } from './group-routines';

/** Identificação de um animal já cadastrado (modo edição). */
export type AnimalFormInitial = {
  id: string;
  name: string | null;
  tagNumber: string | null;
  status: AnimalStatus;
  notes: string | null;
};

type HerdAnimalOption = { id: string; name: string | null; tagNumber: string | null; sex: AnimalSex; status: AnimalStatus };

function animalName(animal: Pick<HerdAnimalOption, 'name' | 'tagNumber'>) { return animal.name || `Brinco ${animal.tagNumber}`; }

/**
 * Formulário real de cadastro/edição de animal (POST/PATCH /api/animals),
 * extraído da página para ser montado também dentro das folhas do jogo (modo
 * create do kit). Sem `onSaved`, o cadastro navega para a ficha — o
 * comportamento histórico da página /rebanho/novo.
 */
export function AnimalForm({ initial, onSaved }: {
  initial?: AnimalFormInitial;
  /** Chamado após salvar; sem ele, o cadastro novo navega para a ficha do animal. */
  onSaved?: (savedId: string) => void | Promise<void>;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit();
  const { data: herd = [] } = useResource<HerdAnimalOption[]>('/api/animals');
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
    if (onSaved) await onSaved(saved.id); else navigate(`/rebanho/${saved.id}`);
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
          <Field label="Situação inicial"><Select value={status} onChange={(event) => changeStatus(event.target.value as AnimalStatus)}>{statusOptions.map((value) => <option value={value} key={value}>{animalStatusLabels[value]}</option>)}</Select></Field>
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
