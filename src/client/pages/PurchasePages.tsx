import { FormEvent, useState } from 'react';
import { Plus, Store, WalletCards } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { Badge, Button, ConfirmButton, EmptyState, ErrorState, Field, FilterBar, Input, LoadingState, PageHeader, ScrollArea, SectionCard, Select, Textarea } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { categoryLabels, today, unitLabels } from '../lib/labels';
import { formatDate, formatMoney, parseDecimal } from '../../domain/format';

type Supplier = { id: string; name: string; notes?: string | null };
type Purchase = { id: string; supplierId: string | null; supplierName: string | null; purchaseDate: string; description: string; category: string; grossAmount?: string; discountAmount?: string; freightAmount?: string; totalAmount: string; dueDate: string | null; paidAt: string | null; status: string; notes: string | null; isOverdue: boolean };
type Item = { id: string; description: string; quantity: string; unit: string; unitPrice: string; totalPrice: string; notes: string | null };
type PurchaseDetail = Purchase & { items: Item[]; attachments: Attachment[]; itemsTotal: number; itemsDifference: number };

export function PurchasesPage() {
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const { data, loading, error, reload } = useResource<Purchase[]>('/api/purchases');
  const filtered = (data ?? []).filter((purchase) => {
    const derivedStatus = purchase.isOverdue ? 'OVERDUE' : purchase.status;
    return (filter === 'ALL' || derivedStatus === filter || (filter === 'OPEN' && purchase.status === 'OPEN' && !purchase.isOverdue))
      && (category === 'ALL' || purchase.category === category)
      && `${purchase.description} ${purchase.supplierName ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
  });
  return <div className="page"><PageHeader icon={WalletCards} title="Compras" subtitle="Despesas, contas e documentos" action={<Link className="button button-primary" to="/compras/nova"><Plus size={18} aria-hidden />Nova compra</Link>} />
    <FilterBar><Field label="Buscar"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Descrição ou fornecedor" /></Field><Field label="Situação"><Select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Todas</option><option value="OPEN">Abertas</option><option value="OVERDUE">Vencidas</option><option value="PAID">Pagas</option><option value="CANCELLED">Canceladas</option></Select></Field><Field label="Categoria"><Select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Todas</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></FilterBar>
    <div className="mt-5">{loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : !filtered.length ? <EmptyState title="Nenhuma compra encontrada" description="Ajuste os filtros ou registre uma nova compra." /> : <SectionCard><ScrollArea label="Lista de compras">{filtered.map((purchase) => <Link className="mobile-item" to={`/compras/${purchase.id}`} key={purchase.id}><span className="min-w-0"><strong className="block truncate">{purchase.description}</strong><span className="text-sm text-[var(--muted)]">{formatDate(purchase.purchaseDate)} · {categoryLabels[purchase.category]}</span><span className="mt-1 block"><Badge tone={purchase.status === 'PAID' ? 'success' : purchase.status === 'CANCELLED' ? 'neutral' : purchase.isOverdue ? 'danger' : 'warning'}>{purchase.status === 'PAID' ? 'Paga' : purchase.status === 'CANCELLED' ? 'Cancelada' : purchase.isOverdue ? 'Vencida' : 'Aberta'}</Badge></span></span><strong>{formatMoney(purchase.totalAmount)}</strong></Link>)}</ScrollArea></SectionCard>}</div>
  </div>;
}

function PurchaseForm({ initial, onSaved }: { initial?: PurchaseDetail; onSaved?: () => void | Promise<void> }) {
  const { data: suppliers, reload: reloadSuppliers } = useResource<Supplier[]>('/api/suppliers');
  const [date, setDate] = useState(initial?.purchaseDate || today());
  const [description, setDescription] = useState(initial?.description || '');
  const [category, setCategory] = useState(initial?.category || 'FEED');
  const [total, setTotal] = useState(initial?.totalAmount || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate || '');
  const [supplierId, setSupplierId] = useState(initial?.supplierId || '');
  const [gross, setGross] = useState(initial?.grossAmount || '');
  const [discount, setDiscount] = useState(initial?.discountAmount || '');
  const [freight, setFreight] = useState(initial?.freightAmount || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const navigate = useNavigate();

  async function createSupplier() {
    setBusy(true); setError('');
    try {
      const created = await api<Supplier>('/api/suppliers', json('POST', { name: newSupplierName, notes: null }));
      setSupplierId(created.id); setNewSupplierName(''); setShowSupplierCreate(false); await reloadSuppliers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar o fornecedor.'); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const totalParsed = parseDecimal(total);
    if (totalParsed === null || totalParsed < 0) { setError('Informe um valor total válido.'); setBusy(false); return; }
    try {
      const saved = await api<{ id: string }>(initial ? `/api/purchases/${initial.id}` : '/api/purchases', json(initial ? 'PATCH' : 'POST', {
        purchaseDate: date, description, category, totalAmount: totalParsed, dueDate: dueDate || null,
        supplierId: supplierId || null, grossAmount: parseDecimal(gross) ?? totalParsed,
        discountAmount: parseDecimal(discount) ?? 0, freightAmount: parseDecimal(freight) ?? 0,
        status: initial?.status || 'OPEN', notes: notes || null,
      }));
      if (initial && onSaved) await onSaved();
      else navigate(`/compras/${saved.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <form className="page-narrow grid gap-5" onSubmit={submit}>{error && <ErrorState message={error} />}
    <SectionCard title="Compra rápida"><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Data"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
      <Field label="Descrição"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Ração do mês" required /></Field>
      <Field label="Categoria"><Select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      <Field label="Valor total"><Input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="0,00" required /></Field>
      <Field label="Vencimento (opcional)"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
    </div></SectionCard>
    <details className="section-card" open={Boolean(initial)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Mais detalhes</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
      <div className="grid min-w-0 gap-2"><Field label="Fornecedor"><Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Sem fornecedor</option>{suppliers?.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setShowSupplierCreate((value) => !value)}><Plus size={17} aria-hidden />Novo fornecedor</Button><Link className="button button-secondary" to="/fornecedores">Ver histórico</Link></div>{showSupplierCreate && <div className="notice notice-info grid gap-2"><Field label="Nome do fornecedor"><Input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} required /></Field><div className="flex gap-2"><Button type="button" disabled={busy || !newSupplierName.trim()} onClick={() => void createSupplier()}>Criar e selecionar</Button><Button type="button" variant="secondary" onClick={() => setShowSupplierCreate(false)}>Cancelar</Button></div></div>}</div>
      <Field label="Valor bruto"><Input inputMode="decimal" value={gross} onChange={(event) => setGross(event.target.value)} /></Field>
      <Field label="Desconto"><Input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} /></Field>
      <Field label="Frete"><Input inputMode="decimal" value={freight} onChange={(event) => setFreight(event.target.value)} /></Field>
      <Field label="Observações"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
    </div></details>
    <Button type="submit" disabled={busy || !description.trim() || !total}>{busy ? 'Salvando…' : 'Salvar compra'}</Button>
  </form>;
}

export function NewPurchasePage() { return <div className="page"><PageHeader icon={WalletCards} title="Nova compra" subtitle="Data, descrição, categoria e total são suficientes" /><PurchaseForm /></div>; }

export function PurchaseDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<PurchaseDetail>(`/api/purchases/${id}`);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [item, setItem] = useState({ description: '', quantity: '1', unit: 'UNIT', unitPrice: '', totalPrice: '' });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  async function action(value: string) {
    setActionError('');
    try { await api(`/api/purchases/${id}`, json('PATCH', { action: value })); reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar.'); }
  }
  async function addItem(event: FormEvent) {
    event.preventDefault(); setActionError('');
    try {
      await api(editingItemId ? `/api/purchase-items/${editingItemId}` : `/api/purchases/${id}/items`, json(editingItemId ? 'PATCH' : 'POST', { ...item, quantity: parseDecimal(item.quantity), unitPrice: parseDecimal(item.unitPrice), totalPrice: parseDecimal(item.totalPrice) }));
      setItem({ description: '', quantity: '1', unit: 'UNIT', unitPrice: '', totalPrice: '' }); setEditingItemId(null); reload();
    }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o item.'); }
  }
  function editItem(row: Item) {
    setItem({ description: row.description, quantity: row.quantity, unit: row.unit, unitPrice: row.unitPrice, totalPrice: row.totalPrice });
    setEditingItemId(row.id);
  }
  async function removeItem(itemId: string) {
    try { await api(`/api/purchase-items/${itemId}`, { method: 'DELETE' }); reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível remover o item.'); }
  }
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Compra não encontrada.'} retry={reload} /></div>;
  if (editing) return <div className="page"><PageHeader title="Editar compra" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><PurchaseForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div>;
  return <div className="page"><PageHeader title={data.description} subtitle={`${formatDate(data.purchaseDate)} · ${categoryLabels[data.category]}`} action={<Button onClick={() => setEditing(true)}>Editar</Button>} />
    <div className="grid gap-5">{actionError && <ErrorState message={actionError} />}
      <SectionCard><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Valor total</p><p className="text-3xl font-bold">{formatMoney(data.totalAmount)}</p>{data.supplierName && <p className="mt-2 text-sm">Fornecedor: {data.supplierName}</p>}{data.dueDate && <p className="mt-1 text-sm">Vencimento: {formatDate(data.dueDate)}</p>}</div><Badge tone={data.status === 'PAID' ? 'success' : data.status === 'CANCELLED' ? 'neutral' : data.isOverdue ? 'danger' : 'warning'}>{data.status === 'PAID' ? 'Paga' : data.status === 'CANCELLED' ? 'Cancelada' : data.isOverdue ? 'Vencida' : 'Aberta'}</Badge></div>
        {data.notes && <p className="mt-4 text-sm">{data.notes}</p>}
        <div className="mt-4 flex flex-wrap gap-2">{data.status === 'OPEN' && <Button onClick={() => void action('pay')}>Marcar como paga</Button>}{data.status !== 'OPEN' && <Button variant="secondary" onClick={() => void action('reopen')}>Reabrir</Button>}{data.status !== 'CANCELLED' && <Button variant="danger" onClick={() => { if (window.confirm('Cancelar esta compra? Ela deixará de entrar nos totais.')) void action('cancel'); }}>Cancelar</Button>}</div>
      </SectionCard>
      <SectionCard title="Itens opcionais">
        {data.items.map((row) => <div className="border-b border-[var(--border)] py-3 last:border-b-0 sm:flex sm:items-center sm:justify-between sm:gap-3" key={row.id}><div><strong>{row.description}</strong><span className="block text-xs text-[var(--muted)]">{Number(row.quantity).toLocaleString('pt-BR')} {unitLabels[row.unit]} × {formatMoney(row.unitPrice)}</span></div><div className="mt-3 sm:mt-0 sm:text-right"><strong className="block">{formatMoney(row.totalPrice)}</strong><div className="mt-2 grid grid-cols-2 gap-2 sm:flex"><Button variant="secondary" onClick={() => editItem(row)}>Editar</Button><ConfirmButton variant="danger" question="Remover este item?" onClick={() => void removeItem(row.id)}>Remover</ConfirmButton></div></div></div>)}
        {data.items.length > 0 && data.itemsDifference !== 0 && <div className="notice notice-warning mt-3">A soma dos itens é {formatMoney(data.itemsTotal)} e difere {formatMoney(Math.abs(data.itemsDifference))} do total da compra. O total da compra não foi alterado.</div>}
        <form className="mt-4 grid gap-3 sm:grid-cols-5 sm:items-end" onSubmit={addItem}><Field label="Descrição"><Input value={item.description} onChange={(event) => setItem({ ...item, description: event.target.value })} required /></Field><Field label="Quantidade"><Input inputMode="decimal" value={item.quantity} onChange={(event) => setItem({ ...item, quantity: event.target.value })} required /></Field><Field label="Unidade"><Select value={item.unit} onChange={(event) => setItem({ ...item, unit: event.target.value })}>{Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Preço unitário"><Input inputMode="decimal" value={item.unitPrice} onChange={(event) => setItem({ ...item, unitPrice: event.target.value, totalPrice: String((parseDecimal(item.quantity) ?? 0) * (parseDecimal(event.target.value) ?? 0)) })} required /></Field><Field label="Total"><Input inputMode="decimal" value={item.totalPrice} onChange={(event) => setItem({ ...item, totalPrice: event.target.value })} required /></Field><div className="flex flex-wrap gap-2 sm:col-span-5"><Button type="submit">{editingItemId ? 'Salvar item' : 'Adicionar item'}</Button>{editingItemId && <Button type="button" variant="secondary" onClick={() => { setEditingItemId(null); setItem({ description: '', quantity: '1', unit: 'UNIT', unitPrice: '', totalPrice: '' }); }}>Cancelar edição</Button>}</div></form>
      </SectionCard>
      <SectionCard title="Nota, boleto e comprovante"><p className="mb-4 text-sm text-[var(--muted)]">Vários documentos continuam vinculados a uma única compra.</p><AttachmentPanel attachments={data.attachments} purchaseId={id} onChange={reload} /></SectionCard>
    </div>
  </div>;
}

export function SuppliersPage() {
  const { data, loading, error, reload } = useResource<Supplier[]>('/api/suppliers');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const filtered = (data ?? []).filter((supplier) => `${supplier.name} ${supplier.notes ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  async function create(event: FormEvent) {
    event.preventDefault(); setActionError('');
    try { await api('/api/suppliers', json('POST', { name, notes: notes || null })); setName(''); setNotes(''); reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar.'); }
  }
  return <div className="page"><PageHeader icon={Store} title="Fornecedores" subtitle="Apenas nome e observação" />
    <div className="grid gap-5 lg:grid-cols-2">{actionError && <ErrorState message={actionError} />}<SectionCard title="Cadastrar fornecedor"><form className="grid gap-3" onSubmit={create}><Field label="Nome"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="Observação"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><Button type="submit">Cadastrar</Button></form></SectionCard>
      <SectionCard title="Fornecedores cadastrados"><Field label="Buscar"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou observação" /></Field><div className="mt-3">{loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : !filtered.length ? <p className="text-sm text-[var(--muted)]">Nenhum fornecedor encontrado.</p> : <ScrollArea label="Fornecedores cadastrados">{filtered.map((supplier) => <Link className="mobile-item" key={supplier.id} to={`/fornecedores/${supplier.id}`}><strong>{supplier.name}</strong><span>Ver compras</span></Link>)}</ScrollArea>}</div></SectionCard>
    </div>
  </div>;
}

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<Supplier & { purchases: Purchase[] }>(`/api/suppliers/${id}`);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  async function save(event: FormEvent) { event.preventDefault(); await api(`/api/suppliers/${id}`, json('PATCH', { name, notes: notes || null })); setEditing(false); reload(); }
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Fornecedor não encontrado.'} retry={reload} /></div>;
  return <div className="page"><PageHeader icon={Store} title={data.name} action={<Button onClick={() => { setName(data.name); setNotes(data.notes || ''); setEditing(true); }}>Editar</Button>} />
    <div className="grid gap-5">{editing && <SectionCard title="Editar fornecedor"><form className="grid gap-3" onSubmit={(event) => void save(event)}><Field label="Nome"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Observação"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><div className="flex gap-2"><Button type="submit">Salvar</Button><Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button></div></form></SectionCard>}
      <SectionCard title="Compras deste fornecedor">{!data.purchases.length ? <p className="text-sm text-[var(--muted)]">Nenhuma compra vinculada.</p> : <ScrollArea label="Compras do fornecedor">{data.purchases.map((purchase) => <Link className="mobile-item" key={purchase.id} to={`/compras/${purchase.id}`}><span><strong>{purchase.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(purchase.purchaseDate)}</span></span><strong>{formatMoney(purchase.totalAmount)}</strong></Link>)}</ScrollArea>}</SectionCard>
    </div>
  </div>;
}
