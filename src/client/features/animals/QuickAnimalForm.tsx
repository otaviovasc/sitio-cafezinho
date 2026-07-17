import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { animalStatusLabels, today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';
import { useToast } from '../../components/feedback-context';

type CreatedAnimal = { id: string; name: string | null; tagNumber: string | null; status: AnimalStatus };

export function QuickAnimalForm({ initialDate = today(), onCreated, onCancel }: { initialDate?: string; onCreated: (animal: CreatedAnimal) => void | Promise<void>; onCancel: () => void }) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const form = useForm(
    { name: '', tagNumber: '', status: 'LACTATING' as AnimalStatus, groupId: '', changedOn: initialDate },
    {
      name: (value, all) => (!value.trim() && !all.tagNumber.trim() ? 'Informe o nome ou o número do brinco.' : undefined),
      groupId: (value, all) => (statusRequiresMilkingGroup(all.status) && !value ? 'Selecione o lote de ordenha.' : undefined),
      changedOn: (value) => (value ? undefined : 'Informe a data inicial.'),
    },
  );

  async function persist() {
    const { name, tagNumber, status, groupId, changedOn } = form.values;
    const created = await api<CreatedAnimal>('/api/animals', json('POST', {
      name: name.trim() || null,
      tagNumber: tagNumber.trim() || null,
      status,
      changedOn,
      groupId: statusRequiresMilkingGroup(status) ? groupId : null,
      notes: 'Cadastrado durante a revisão de um controle individual.',
    }));
    toast('Animal cadastrado');
    await onCreated(created);
  }

  return <form className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <p className="text-sm text-[var(--muted)]">Cadastre sem perder a revisão. Depois, selecione o novo animal na linha correspondente.</p>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Nome" hint="Informe o nome ou o brinco." error={form.error('name')}><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} onBlur={() => form.blur('name')} /></Field><Field label="Brinco"><Input value={form.values.tagNumber} onChange={(event) => form.set('tagNumber', event.target.value)} /></Field></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Situação na data do controle"><Select value={form.values.status} onChange={(event) => form.set('status', event.target.value as AnimalStatus)}>{Object.entries(animalStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Data inicial" error={form.error('changedOn')}><Input type="date" max={today()} value={form.values.changedOn} onChange={(event) => form.set('changedOn', event.target.value)} onBlur={() => form.blur('changedOn')} required /></Field></div>
    {statusRequiresMilkingGroup(form.values.status) && <GroupPicker value={form.values.groupId} fieldError={form.error('groupId')} onChange={(value) => form.set('groupId', value)} />}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar e voltar à revisão'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
