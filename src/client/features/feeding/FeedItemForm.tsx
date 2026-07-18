import { ErrorState, Field, FormErrorSummary, Input, Select, SubmitBar } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import type { FeedUnit } from '../../../domain/feeding';
import type { FeedItemRow } from './types';

/**
 * Item novo do catálogo de alimentos: nome em PT-BR + unidade canônica. A
 * unidade é a do banco (KG/L/un); toneladas são só conveniência de digitação
 * nos formulários de compra e trato.
 */
export function FeedItemForm({ onSaved }: { onSaved: (item: FeedItemRow) => void }) {
  const { busy, error, run } = useSubmit();
  const form = useForm(
    { name: '', canonicalUnit: 'KG' as FeedUnit },
    { name: (value) => (value.trim() ? undefined : 'Informe o nome do item.') },
  );

  async function persist() {
    const created = await api<FeedItemRow>('/api/feed-items', json('POST', {
      name: form.values.name.trim(),
      canonicalUnit: form.values.canonicalUnit,
    }));
    onSaved(created);
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <Field label="Nome do item" hint="Ex.: Silagem de milho, Ração 22%, Mineral em pó." error={form.error('name')}>
      <Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} onBlur={() => form.blur('name')} autoFocus required />
    </Field>
    <Field label="Unidade de controle" hint="Como o estoque é medido. Toneladas viram quilos automaticamente.">
      <Select value={form.values.canonicalUnit} onChange={(event) => form.set('canonicalUnit', event.target.value as FeedUnit)}>
        <option value="KG">Quilos (kg)</option>
        <option value="LITER">Litros (L)</option>
        <option value="UNIT">Unidades</option>
      </Select>
    </Field>
    <SubmitBar label="Salvar item" busy={busy} />
  </form>;
}
