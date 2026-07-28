import { useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PurchaseAreaNav } from '../components/PurchaseAreaNav';
import { Button, EmptyState, ErrorState, Field, Input, PageHeader, ScrollArea, SectionCard, SkeletonList, StatusBadge } from '../components/ui';
import { CatalogItemEditor } from '../features/feeding/CatalogItemEditor';
import { FeedItemForm } from '../features/feeding/FeedItemForm';
import { FeedPurchaseForm } from '../features/feeding/FeedPurchaseForm';
import { formatFeedQuantity, type FeedInventoryRow } from '../features/feeding/types';
import { useResource } from '../hooks/useResource';

const inactiveDescriptor = { label: 'Inativo', tone: 'neutral' as const };

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
