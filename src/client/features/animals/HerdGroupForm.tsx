import { Button, ErrorState, Field, FormErrorSummary, Input, Select } from '../../components/ui';
import { useToast } from '../../components/feedback-context';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { milkingRoutineLabels } from '../../lib/labels';
import type { MilkingRoutine } from '../../../domain/herd';
import type { HerdGroup } from './GroupPicker';

/**
 * Criação (POST /api/herd-groups) e edição (PATCH /api/herd-groups/:id) de um
 * lote: nome + rotina de ordenha. Lotes novos nascem ativos e sem animais; a
 * edição preserva o estado de arquivamento do lote.
 */
export function HerdGroupForm({ initial, onSaved, onCancel }: {
  /** Lote existente: modo edição. */
  initial?: HerdGroup;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const form = useForm(
    { name: initial?.name ?? '', milkingRoutine: (initial?.milkingRoutine ?? 'MORNING_AND_AFTERNOON') as MilkingRoutine },
    { name: (value) => (value.trim() ? undefined : 'Informe o nome do lote.') },
  );

  async function persist() {
    const body = { name: form.values.name.trim(), milkingRoutine: form.values.milkingRoutine, active: initial?.active ?? true };
    await api(initial ? `/api/herd-groups/${initial.id}` : '/api/herd-groups', json(initial ? 'PATCH' : 'POST', body));
    toast(initial ? `Lote ${body.name} atualizado` : `Lote ${body.name} criado`);
    await onSaved();
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <Field label="Nome do lote" error={form.error('name')}><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} onBlur={() => form.blur('name')} placeholder="Ex.: Lote 2" autoFocus required /></Field>
    <Field label="Rotina de ordenha"><Select value={form.values.milkingRoutine} onChange={(event) => form.set('milkingRoutine', event.target.value as MilkingRoutine)}>{Object.entries(milkingRoutineLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar lote' : 'Criar lote'}</Button>
      <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
    </div>
  </form>;
}
