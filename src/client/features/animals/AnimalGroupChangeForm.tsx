import { ArrowRightLeft } from 'lucide-react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { Button, ErrorState, Field, FormErrorSummary, Input } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { today } from '../../lib/labels';
import { GroupPicker } from './GroupPicker';
import { milkingGroupRoutines, nonMilkingGroupRoutines } from './group-routines';
import { useToast } from '../../components/feedback-context';

export function AnimalGroupChangeForm({ animalId, status, currentGroupId, onSaved, onCancel }: { animalId: string; status: AnimalStatus; currentGroupId?: string | null; onSaved: () => void | Promise<void>; onCancel?: () => void }) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  // Lactação exige lote com ordenha; demais situações vivas só aceitam sem ordenha.
  const routines = status === 'LACTATING' ? milkingGroupRoutines : nonMilkingGroupRoutines;
  const form = useForm(
    { groupId: currentGroupId ?? '', startedOn: today(), notes: '' },
    {
      groupId: (value) => (!value ? 'Selecione o novo lote.' : value === currentGroupId ? 'Selecione um lote diferente do atual.' : undefined),
      startedOn: (value) => (value ? undefined : 'Informe a data da mudança.'),
    },
  );

  async function persist() {
    const { groupId, startedOn, notes } = form.values;
    await api(`/api/animals/${animalId}/group-assignments`, json('POST', { groupId, startedOn, notes: notes.trim() || null }));
    toast('Lote do animal atualizado');
    await onSaved();
  }

  return <form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>{error && <ErrorState message={error} />}<FormErrorSummary errors={form.visibleErrors} /><GroupPicker label="Novo lote" routines={routines} value={form.values.groupId} fieldError={form.error('groupId')} onChange={(value) => form.set('groupId', value)} /><div className="grid gap-3 sm:grid-cols-2"><Field label="Data da mudança" error={form.error('startedOn')}><Input type="date" value={form.values.startedOn} max={today()} onChange={(event) => form.set('startedOn', event.target.value)} onBlur={() => form.blur('startedOn')} required /></Field><Field label="Motivo (opcional)"><Input value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} placeholder="Ex.: ajuste do manejo" /></Field></div><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}><ArrowRightLeft size={18} aria-hidden />{busy ? 'Movendo…' : 'Registrar mudança'}</Button>{onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}</div></form>;
}
