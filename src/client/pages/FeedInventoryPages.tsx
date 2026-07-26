import { useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { FeedUnit } from '../../domain/feeding';
import { PurchaseAreaNav } from '../components/PurchaseAreaNav';
import { Button, EmptyState, ErrorState, Field, FormErrorSummary, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatusBadge, SubmitBar } from '../components/ui';
import { FeedItemForm } from '../features/feeding/FeedItemForm';
import { FeedPurchaseForm } from '../features/feeding/FeedPurchaseForm';
import { formatFeedQuantity, type FeedInventoryRow } from '../features/feeding/types';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, json } from '../lib/api';

const activeDescriptor = { label: 'Ativo', tone: 'success' as const };
const inactiveDescriptor = { label: 'Inativo', tone: 'neutral' as const };
const unitLabels: Record<FeedUnit, string> = { KG: 'Quilos (kg)', LITER: 'Litros (L)', UNIT: 'Unidades' };

export function FeedInventoryPage() {
  const { data, loading, error, reload } = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const rows = (data ?? []).filter((row) => row.active || row.purchasedQuantity !== 0 || row.consumedQuantity !== 0);
  return <div className="page">
    <PageHeader icon={Package} title="Estoque de alimentos" subtitle="Saldo calculado pelas compras menos o consumo registrado" action={<Link className="button button-primary" to="/compras/alimentos/nova"><Plus size={18} aria-hidden />Registrar entrada</Link>} />
    <PurchaseAreaNav />
    {loading ? <SkeletonList rows={5} />
      : error ? <ErrorState message={error} retry={reload} />
        : !rows.length ? <EmptyState title="Estoque sem movimentações" description="Cadastre um item e registre uma compra de alimento para iniciar o controle." action={<Link className="button button-primary" to="/catalogo-alimentos">Abrir catálogo</Link>} />
          : <SectionCard><ScrollArea label="Estoque de alimentos">{rows.map((row) => <div className="mobile-item" key={row.feedItemId}>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2"><strong>{row.name}</strong>{!row.active && <StatusBadge descriptor={inactiveDescriptor} />}</span>
              <span className="block text-xs text-[var(--muted)]">Comprado {formatFeedQuantity(row.purchasedQuantity, row.canonicalUnit)} · consumido {formatFeedQuantity(row.consumedQuantity, row.canonicalUnit)}</span>
            </span>
            <span className="shrink-0 text-right"><span className="block text-xs text-[var(--muted)]">Saldo</span><strong>{formatFeedQuantity(row.balance, row.canonicalUnit)}</strong></span>
          </div>)}</ScrollArea></SectionCard>}
  </div>;
}

export function NewFeedPurchasePage() {
  const navigate = useNavigate();
  return <div className="page">
    <div className="page-narrow">
      <PageHeader icon={Package} title="Registrar entrada de alimento" subtitle="A compra cria uma saída financeira e credita o estoque" />
      <PurchaseAreaNav />
      <FeedPurchaseForm onSaved={() => navigate('/estoque-alimentos', { replace: true })} />
    </div>
  </div>;
}

function CatalogItemEditor({ row, onChanged }: { row: FeedInventoryRow; onChanged: () => void }) {
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
            {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
      </div>
      <SubmitBar label="Salvar item" busy={busy} secondary={<Button type="button" variant="secondary" onClick={() => { form.reset({ name: row.name, canonicalUnit: row.canonicalUnit }); setEditing(false); }}>Cancelar</Button>} />
    </form> : <>
      {error && <ErrorState message={error} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-2"><strong>{row.name}</strong><StatusBadge descriptor={row.active ? activeDescriptor : inactiveDescriptor} /></span>
          <span className="block text-xs text-[var(--muted)]">{unitLabels[row.canonicalUnit]} · saldo {formatFeedQuantity(row.balance, row.canonicalUnit)}</span>
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

export function FeedCatalogPage() {
  const { data, loading, error, reload } = useResource<FeedInventoryRow[]>('/api/feed-inventory');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const rows = (data ?? []).filter((row) => row.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="page">
    <PageHeader icon={Package} title="Catálogo de alimentos" subtitle="Itens usados nas compras, no estoque e nos tratos" action={creating ? undefined : <Button onClick={() => setCreating(true)}><Plus size={18} aria-hidden />Novo item</Button>} />
    <PurchaseAreaNav />
    {creating && <SectionCard title="Cadastrar item" action={<Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>}><FeedItemForm onSaved={() => { setCreating(false); reload(); }} /></SectionCard>}
    <div className={creating ? 'mt-5' : ''}>
      <Field label="Buscar no catálogo"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome do item" /></Field>
    </div>
    <div className="mt-5">
      {loading ? <SkeletonList rows={5} />
        : error ? <ErrorState message={error} retry={reload} />
          : !rows.length ? <EmptyState title="Nenhum item encontrado" description={search ? 'Tente outro nome.' : 'Cadastre o primeiro alimento usado na propriedade.'} />
            : <SectionCard>{rows.map((row) => <CatalogItemEditor key={row.feedItemId} row={row} onChanged={reload} />)}</SectionCard>}
    </div>
  </div>;
}
