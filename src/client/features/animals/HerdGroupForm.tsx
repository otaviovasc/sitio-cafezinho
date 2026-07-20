import { Button, ErrorState, Field, FormErrorSummary, Input, Select } from '../../components/ui';
import { useToast } from '../../components/feedback-context';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { milkingRoutineLabels } from '../../lib/labels';
import type { MilkingRoutine } from '../../../domain/herd';

/**
 * Criação de um lote (POST /api/herd-groups) fora do cadastro de animal:
 * nome + rotina de ordenha. Lotes novos nascem ativos e sem animais.
 */
export function HerdGroupForm({ onSaved, onCancel }: {
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const form = useForm(
    { name: '', milkingRoutine: 'MORNING_AND_AFTERNOON' as MilkingRoutine },
    { name: (value) => (value.trim() ? undefined : 'Informe o nome do lote.') },
  );

  async function persist() {
    await api('/api/herd-groups', json('POST', { name: form.values.name.trim(), milkingRoutine: form.values.milkingRoutine, active: true }));
    toast(`Lote ${form.values.name.trim()} criado`);
    await onSaved();
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <Field label="Nome do lote" error={form.error('name')}><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} onBlur={() => form.blur('name')} placeholder="Ex.: Lote 2" autoFocus required /></Field>
    <Field label="Rotina de ordenha"><Select value={form.values.milkingRoutine} onChange={(event) => form.set('milkingRoutine', event.target.value as MilkingRoutine)}>{Object.entries(milkingRoutineLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{busy ? 'Criando…' : 'Criar lote'}</Button>
      <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
    </div>
  </form>;
}
