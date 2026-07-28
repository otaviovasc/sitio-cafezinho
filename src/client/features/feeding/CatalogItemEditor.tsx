import { useState } from 'react';
import type { FeedUnit } from '../../../domain/feeding';
import { Button, ErrorState, Field, FormErrorSummary, Input, Select, StatusBadge, SubmitBar } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { formatFeedQuantity, type FeedInventoryRow } from './types';

const activeDescriptor = { label: 'Ativo', tone: 'success' as const };
const inactiveDescriptor = { label: 'Inativo', tone: 'neutral' as const };
const feedUnitLabels: Record<FeedUnit, string> = { KG: 'Quilos (kg)', LITER: 'Litros (L)', UNIT: 'Unidades' };

/**
 * Item do catálogo como entidade editável (PATCH /api/feed-items/:id):
 * renomear, ativar/desativar e — só antes da primeira movimentação — trocar a
 * unidade de controle (o servidor bloqueia depois: mudar a unidade
 * reinterpretaria todo o histórico). Extraído da FeedCatalogPage para ser
 * montado também no Depósito e no Caderno do jogo.
 */
export function CatalogItemEditor({ row, onChanged }: { row: FeedInventoryRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useSubmit();
  const form = useForm(
    { name: row.name, canonicalUnit: row.canonicalUnit },
    { name: (value) => (value.trim() ? undefined : 'Informe o nome do item.') },
  );
  useUnsavedGuard(editing && form.dirty);
  const hasMovements = row.purchasedQuantity !== 0 || row.consumedQuantity !== 0;

  async function save() {
    await api(`/api/feed-items/${row.feedItemId}`, json('PATCH', {
      name: form.values.name.trim(),
      canonicalUnit: form.values.canonicalUnit,
    }));
    setEditing(false);
    onChanged();
  }

  async function setActive(active: boolean) {
    await api(`/api/feed-items/${row.feedItemId}`, json('PATCH', { active }));
    onChanged();
  }

  return <div className="border-b border-[var(--border)] py-4 last:border-b-0" data-testid={`feed-catalog-item-${row.feedItemId}`}>
    {editing ? <form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(save); }}>
      {error && <ErrorState message={error} />}
      <FormErrorSummary errors={form.visibleErrors} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do item" error={form.error('name')}><Input value={form.values.name} onBlur={() => form.blur('name')} onChange={(event) => form.set('name', event.target.value)} /></Field>
        <Field label="Unidade de controle" hint={hasMovements ? 'Bloqueada porque já existem movimentações.' : undefined}>
          <Select disabled={hasMovements} value={form.values.canonicalUnit} onChange={(event) => form.set('canonicalUnit', event.target.value as FeedUnit)}>
            {Object.entries(feedUnitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
      </div>
      <SubmitBar label="Salvar item" busy={busy} secondary={<Button type="button" variant="secondary" onClick={() => { form.reset({ name: row.name, canonicalUnit: row.canonicalUnit }); setEditing(false); }}>Cancelar</Button>} />
    </form> : <>
      {error && <ErrorState message={error} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-2"><strong>{row.name}</strong><StatusBadge descriptor={row.active ? activeDescriptor : inactiveDescriptor} /></span>
          <span className="block text-xs text-[var(--muted)]">{feedUnitLabels[row.canonicalUnit]} · saldo {formatFeedQuantity(row.balance, row.canonicalUnit)}</span>
          {hasMovements && <span className="block text-xs text-[var(--muted)]">A unidade está protegida para preservar o histórico.</span>}
        </div>
        <div className="grid shrink-0 gap-2 sm:flex">
          <Button variant="secondary" onClick={() => { form.reset({ name: row.name, canonicalUnit: row.canonicalUnit }); setEditing(true); }}>Editar</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => setActive(!row.active))}>{row.active ? 'Desativar' : 'Reativar'}</Button>
        </div>
      </div>
    </>}
  </div>;
}
