import { FormEvent, useState } from 'react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { statusRequiresMilkingGroup } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select } from '../../components/ui';
import { api, json } from '../../lib/api';
import { animalStatusLabels, today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';
import { useToast } from '../../components/feedback-context';

type CreatedAnimal = { id: string; name: string | null; tagNumber: string | null; status: AnimalStatus };

export function QuickAnimalForm({ initialDate = today(), onCreated, onCancel }: { initialDate?: string; onCreated: (animal: CreatedAnimal) => void | Promise<void>; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [tagNumber, setTagNumber] = useState('');
  const [status, setStatus] = useState<AnimalStatus>('LACTATING');
  const [groupId, setGroupId] = useState('');
  const [changedOn, setChangedOn] = useState(initialDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ identity?: string; group?: string; date?: string }>({});

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const nextErrors = {
      identity: !name.trim() && !tagNumber.trim() ? 'Informe o nome ou o número do brinco.' : undefined,
      group: statusRequiresMilkingGroup(status) && !groupId ? 'Selecione o lote de ordenha.' : undefined,
      date: changedOn ? undefined : 'Informe a data inicial.',
    };
    setFieldErrors(nextErrors);
    if (nextErrors.identity || nextErrors.group || nextErrors.date) return;
    setBusy(true);
    try {
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar o animal.'); }
    finally { setBusy(false); }
  }

  return <form className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4" noValidate onSubmit={submit}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={Object.values(fieldErrors)} />
    <p className="text-sm text-[var(--muted)]">Cadastre sem perder a revisão. Depois, selecione o novo animal na linha correspondente.</p>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Nome" hint="Informe o nome ou o brinco." error={fieldErrors.identity}><Input value={name} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, identity: undefined })); }} /></Field><Field label="Brinco"><Input value={tagNumber} onChange={(event) => { setTagNumber(event.target.value); setFieldErrors((current) => ({ ...current, identity: undefined })); }} /></Field></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Situação na data do controle"><Select value={status} onChange={(event) => setStatus(event.target.value as AnimalStatus)}>{Object.entries(animalStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field><Field label="Data inicial" error={fieldErrors.date}><Input type="date" max={today()} value={changedOn} onChange={(event) => { setChangedOn(event.target.value); setFieldErrors((current) => ({ ...current, date: undefined })); }} required /></Field></div>
    {statusRequiresMilkingGroup(status) && <GroupPicker value={groupId} fieldError={fieldErrors.group} onChange={(value) => { setGroupId(value); setFieldErrors((current) => ({ ...current, group: undefined })); }} />}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar e voltar à revisão'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
