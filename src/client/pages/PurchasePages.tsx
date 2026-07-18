import { useState } from 'react';
import { Plus, Store, WalletCards } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { FinanceDirectionSwitch } from '../components/FinanceDirectionSwitch';
import { DecimalInput, MoneyInput } from '../components/form-controls';
import { useConfirm } from '../components/feedback-context';
import { ConfirmButton } from '../components/feedback';
import { Button, ChoiceCard, EmptyState, ErrorState, Field, FormErrorSummary, InlineEmpty, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatusBadge, SubmitBar, Textarea } from '../components/ui';
import { FilterControls } from '../components/FilterControls';
import { purchaseStatusDescriptor } from '../lib/status';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
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
  return <div className="page"><PageHeader icon={WalletCards} title="Compras" subtitle="Saídas: compras, contas e despesas da propriedade" action={<Link className="button button-primary" to="/compras/nova"><Plus size={18} aria-hidden />Registrar saída</Link>} />
    <FilterControls
      search={{ value: search, onChange: setSearch, placeholder: 'Descrição ou fornecedor' }}
      selects={[
        { label: 'Situação', value: filter, onChange: setFilter, options: [{ value: 'ALL', label: 'Todas' }, { value: 'OPEN', label: 'Abertas' }, { value: 'OVERDUE', label: 'Vencidas' }, { value: 'PAID', label: 'Pagas' }, { value: 'CANCELLED', label: 'Canceladas' }] },
        { label: 'Categoria', value: category, onChange: setCategory, options: [{ value: 'ALL', label: 'Todas' }, ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))] },
      ]}
    />
    <div className="mt-5">{loading ? <SkeletonList rows={6} /> : error ? <ErrorState message={error} retry={reload} /> : !filtered.length ? <EmptyState title="Nenhuma compra encontrada" description="Ajuste os filtros ou registre uma nova compra." /> : <SectionCard><ScrollArea label="Lista de compras">{filtered.map((purchase) => <Link className="mobile-item" to={`/compras/${purchase.id}`} key={purchase.id}><span className="min-w-0"><strong className="block truncate">{purchase.description}</strong><span className="text-sm text-[var(--muted)]">{formatDate(purchase.purchaseDate)} · {categoryLabels[purchase.category]}</span><span className="mt-1 block"><StatusBadge descriptor={purchaseStatusDescriptor(purchase.status, purchase.isOverdue, 'Aberta')} /></span></span><strong>{formatMoney(purchase.totalAmount)}</strong></Link>)}</ScrollArea></SectionCard>}</div>
  </div>;
}

function PurchaseForm({ initial, onSaved }: { initial?: PurchaseDetail; onSaved?: () => void | Promise<void> }) {
  const { data: suppliers, reload: reloadSuppliers } = useResource<Supplier[]>('/api/suppliers');
  const { busy, error, run } = useSubmit();
  const form = useForm(
    {
      date: initial?.purchaseDate || today(),
      description: initial?.description || '',
      category: initial?.category || 'FEED',
      total: initial?.totalAmount || '',
      dueDate: initial?.dueDate || '',
      supplierId: initial?.supplierId || '',
      gross: initial?.grossAmount || '',
      discount: initial?.discountAmount || '',
      freight: initial?.freightAmount || '',
      notes: initial?.notes || '',
      paid: initial?.status === 'PAID',
    },
    {
      date: (value) => (value ? undefined : 'Informe a data da saída.'),
      description: (value) => (value.trim() ? undefined : 'Descreva o que foi comprado ou pago.'),
      total: (value) => {
        const parsed = parseDecimal(value);
        return parsed !== null && parsed > 0 ? undefined : 'Informe um valor maior que zero.';
      },
      gross: (value) => {
        if (!value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed === null || parsed < 0 ? 'Informe um valor bruto válido.' : undefined;
      },
      discount: (value) => {
        if (!value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed === null || parsed < 0 ? 'Informe um desconto válido.' : undefined;
      },
      freight: (value) => {
        if (!value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed === null || parsed < 0 ? 'Informe um frete válido.' : undefined;
      },
    },
  );
  useUnsavedGuard(form.dirty);
  const [showSupplierCreate, setShowSupplierCreate] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const navigate = useNavigate();

  async function createSupplier() {
    const created = await api<Supplier>('/api/suppliers', json('POST', { name: newSupplierName, notes: null }));
    form.set('supplierId', created.id); setNewSupplierName(''); setShowSupplierCreate(false); await reloadSuppliers();
  }

  async function persist() {
    const { date, description, category, total, dueDate, supplierId, gross, discount, freight, notes, paid } = form.values;
    const totalParsed = parseDecimal(total);
    const grossParsed = parseDecimal(gross);
    const discountParsed = parseDecimal(discount);
    const freightParsed = parseDecimal(freight);
    if (totalParsed === null) return;
    const saved = await api<{ id: string }>(initial ? `/api/purchases/${initial.id}` : '/api/purchases', json(initial ? 'PATCH' : 'POST', {
      purchaseDate: date, description, category, totalAmount: totalParsed, dueDate: !initial && paid ? null : dueDate || null,
      supplierId: supplierId || null, grossAmount: grossParsed ?? totalParsed,
      discountAmount: discountParsed ?? 0, freightAmount: freightParsed ?? 0,
      status: initial?.status || (paid ? 'PAID' : 'OPEN'), notes: notes || null,
    }));
    if (initial && onSaved) await onSaved();
    else navigate(`/compras/${saved.id}`);
  }
  return <form className="page-narrow grid gap-5" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>{error && <ErrorState message={error} />}<FormErrorSummary errors={form.visibleErrors} />
    <SectionCard title="Dados da saída"><div className="grid gap-4 sm:grid-cols-2">
      <Field label="Categoria"><Select value={form.values.category} onChange={(event) => form.set('category', event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      <Field label="Data" error={form.error('date')}><Input type="date" value={form.values.date} required onChange={(event) => form.set('date', event.target.value)} onBlur={() => form.blur('date')} /></Field>
      <Field label="Descrição" hint="Ex.: Ração do mês ou conta de energia" error={form.error('description')}><Input value={form.values.description} required onChange={(event) => form.set('description', event.target.value)} onBlur={() => form.blur('description')} /></Field>
      <Field label="Valor total da saída" hint="Valor final da compra, conta ou despesa." error={form.error('total')}><MoneyInput value={form.values.total} required onValueChange={(value) => form.set('total', value)} onBlur={() => form.blur('total')} placeholder="0,00" /></Field>
      {initial && <Field label="Vencimento (opcional)" hint="A situação do pagamento é alterada na tela de detalhes."><Input type="date" value={form.values.dueDate} onChange={(event) => form.set('dueDate', event.target.value)} /></Field>}
      <div className="grid min-w-0 gap-2 sm:col-span-2"><Field label="Fornecedor"><Select value={form.values.supplierId} onChange={(event) => form.set('supplierId', event.target.value)}><option value="">Sem fornecedor informado</option>{suppliers?.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></Field><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setShowSupplierCreate((value) => !value)}><Plus size={17} aria-hidden />Novo fornecedor</Button><Link className="button button-secondary" to="/fornecedores">Ver fornecedores</Link></div>{showSupplierCreate && <div className="notice notice-info grid gap-2"><Field label="Nome do fornecedor"><Input value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} /></Field><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !newSupplierName.trim()} onClick={() => void run(createSupplier)}>Criar e selecionar</Button><Button type="button" variant="secondary" onClick={() => setShowSupplierCreate(false)}>Cancelar</Button></div></div>}</div>
    </div></SectionCard>
    {!initial && <SectionCard title="Situação do pagamento"><div className="grid gap-2 sm:grid-cols-2">
      <ChoiceCard name="purchase-status" value="paid" checked={form.values.paid} onChange={() => form.set('paid', true)} title="Já paguei" description="Entra nas saídas do caixa agora" />
      <ChoiceCard name="purchase-status" value="open" checked={!form.values.paid} onChange={() => form.set('paid', false)} title="Pagar depois" description="Fica separado como valor a pagar" />
    </div>{!form.values.paid && <div className="mt-3"><Field label="Vencimento (opcional)" hint="Ajuda a destacar contas atrasadas."><Input type="date" value={form.values.dueDate} onChange={(event) => form.set('dueDate', event.target.value)} /></Field></div>}</SectionCard>}
    <details className="section-card" open={Boolean(initial)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Valores e observações opcionais</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
      <Field label="Valor bruto" error={form.error('gross')}><MoneyInput value={form.values.gross} onValueChange={(value) => form.set('gross', value)} onBlur={() => form.blur('gross')} /></Field>
      <Field label="Desconto" error={form.error('discount')}><MoneyInput value={form.values.discount} onValueChange={(value) => form.set('discount', value)} onBlur={() => form.blur('discount')} /></Field>
      <Field label="Frete" error={form.error('freight')}><MoneyInput value={form.values.freight} onValueChange={(value) => form.set('freight', value)} onBlur={() => form.blur('freight')} /></Field>
      <div className="sm:col-span-2"><Field label="Observações"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field></div>
    </div></details>
    <SubmitBar label={initial ? 'Salvar alterações' : 'Registrar saída'} busy={busy} />
  </form>;
}

export function NewPurchasePage() { return <div className="page"><div className="page-narrow"><PageHeader icon={WalletCards} title="Registrar saída" subtitle="Compra, conta ou despesa que foi paga — ou que ainda será paga" /><div className="mb-5"><FinanceDirectionSwitch active="expense" /></div><PurchaseForm /></div></div>; }

export function PurchaseDetailPage() {
  const { id = '' } = useParams();
  const confirm = useConfirm();
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
  async function addItem() {
    setActionError('');
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
  async function cancelPurchase() {
    const accepted = await confirm({
      title: 'Cancelar compra?',
      description: 'Ela deixará de entrar nos totais, mas o registro continuará preservado.',
      confirmLabel: 'Cancelar compra',
      tone: 'danger',
    });
    if (accepted) await action('cancel');
  }
  if (loading) return <div className="page"><SkeletonList rows={5} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Compra não encontrada.'} retry={reload} /></div>;
  if (editing) return <div className="page"><PageHeader title="Editar compra" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><PurchaseForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div>;
  return <div className="page"><PageHeader title={data.description} subtitle={`${formatDate(data.purchaseDate)} · ${categoryLabels[data.category]}`} action={<Button onClick={() => setEditing(true)}>Editar</Button>} />
    <div className="grid gap-5">{actionError && <ErrorState message={actionError} />}
      <SectionCard><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Valor da saída</p><p className="text-3xl font-bold">{formatMoney(data.totalAmount)}</p>{data.supplierName && <p className="mt-2 text-sm">Fornecedor: {data.supplierName}</p>}{data.dueDate && <p className="mt-1 text-sm">Vencimento: {formatDate(data.dueDate)}</p>}</div><StatusBadge descriptor={purchaseStatusDescriptor(data.status, data.isOverdue)} /></div>
        {data.notes && <p className="mt-4 text-sm">{data.notes}</p>}
        <div className="mt-4 flex flex-wrap gap-2">{data.status === 'OPEN' && <Button onClick={() => void action('pay')}>Marcar como paga</Button>}{data.status !== 'OPEN' && <Button variant="secondary" onClick={() => void action('reopen')}>Reabrir</Button>}{data.status !== 'CANCELLED' && <Button variant="danger" onClick={() => void cancelPurchase()}>Cancelar</Button>}</div>
      </SectionCard>
      <SectionCard title="Itens opcionais">
        {data.items.map((row) => <div className="border-b border-[var(--border)] py-3 last:border-b-0 sm:flex sm:items-center sm:justify-between sm:gap-3" key={row.id}><div><strong>{row.description}</strong><span className="block text-xs text-[var(--muted)]">{Number(row.quantity).toLocaleString('pt-BR')} {unitLabels[row.unit]} × {formatMoney(row.unitPrice)}</span></div><div className="mt-3 sm:mt-0 sm:text-right"><strong className="block">{formatMoney(row.totalPrice)}</strong><div className="mt-2 grid grid-cols-2 gap-2 sm:flex"><Button variant="secondary" onClick={() => editItem(row)}>Editar</Button><ConfirmButton variant="danger" question="Remover este item?" onClick={() => void removeItem(row.id)}>Remover</ConfirmButton></div></div></div>)}
        {data.items.length > 0 && data.itemsDifference !== 0 && <div className="notice notice-warning mt-3">A soma dos itens é {formatMoney(data.itemsTotal)} e difere {formatMoney(Math.abs(data.itemsDifference))} do total da compra. O total da compra não foi alterado.</div>}
        <form className="mt-4 grid gap-3 sm:grid-cols-5 sm:items-end" onSubmit={(event) => { event.preventDefault(); void addItem(); }}><Field label="Descrição"><Input value={item.description} onChange={(event) => setItem({ ...item, description: event.target.value })} required /></Field><Field label="Quantidade"><DecimalInput value={item.quantity} onValueChange={(value) => setItem({ ...item, quantity: value })} required /></Field><Field label="Unidade"><Select value={item.unit} onChange={(event) => setItem({ ...item, unit: event.target.value })}>{Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Preço unitário"><MoneyInput value={item.unitPrice} onValueChange={(value) => setItem({ ...item, unitPrice: value, totalPrice: String((parseDecimal(item.quantity) ?? 0) * (parseDecimal(value) ?? 0)) })} required /></Field><Field label="Total"><MoneyInput value={item.totalPrice} onValueChange={(value) => setItem({ ...item, totalPrice: value })} required /></Field><div className="flex flex-wrap gap-2 sm:col-span-5"><Button type="submit">{editingItemId ? 'Salvar item' : 'Adicionar item'}</Button>{editingItemId && <Button type="button" variant="secondary" onClick={() => { setEditingItemId(null); setItem({ description: '', quantity: '1', unit: 'UNIT', unitPrice: '', totalPrice: '' }); }}>Cancelar edição</Button>}</div></form>
      </SectionCard>
      <SectionCard title="Nota, boleto e comprovante"><p className="mb-4 text-sm text-[var(--muted)]">Vários documentos continuam vinculados a uma única compra.</p><AttachmentPanel attachments={data.attachments} purchaseId={id} onChange={reload} /></SectionCard>
    </div>
  </div>;
}

export function SuppliersPage() {
  const { data, loading, error, reload } = useResource<Supplier[]>('/api/suppliers');
  const { busy, error: submitError, run } = useSubmit();
  const form = useForm({ name: '', notes: '' });
  useUnsavedGuard(form.dirty);
  const [search, setSearch] = useState('');
  const filtered = (data ?? []).filter((supplier) => `${supplier.name} ${supplier.notes ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  async function create() {
    await api('/api/suppliers', json('POST', { name: form.values.name, notes: form.values.notes || null }));
    form.reset({ name: '', notes: '' }); reload();
  }
  return <div className="page"><PageHeader icon={Store} title="Fornecedores" subtitle="Apenas nome e observação" />
    <div className="grid gap-5 lg:grid-cols-2">{submitError && <ErrorState message={submitError} />}<SectionCard title="Cadastrar fornecedor"><form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(create); }}><FormErrorSummary errors={form.visibleErrors} /><Field label="Nome"><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} required /></Field><Field label="Observação"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field><SubmitBar label="Cadastrar" busy={busy} /></form></SectionCard>
      <SectionCard title="Fornecedores cadastrados"><Field label="Buscar"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou observação" /></Field><div className="mt-3">{loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} retry={reload} /> : !filtered.length ? <InlineEmpty>Nenhum fornecedor encontrado.</InlineEmpty> : <ScrollArea label="Fornecedores cadastrados">{filtered.map((supplier) => <Link className="mobile-item" key={supplier.id} to={`/fornecedores/${supplier.id}`}><strong>{supplier.name}</strong><span>Ver compras</span></Link>)}</ScrollArea>}</div></SectionCard>
    </div>
  </div>;
}

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<Supplier & { purchases: Purchase[] }>(`/api/suppliers/${id}`);
  const { busy, error: submitError, run } = useSubmit();
  const [editing, setEditing] = useState(false);
  const form = useForm({ name: '', notes: '' });
  useUnsavedGuard(form.dirty);
  async function save() { await api(`/api/suppliers/${id}`, json('PATCH', { name: form.values.name, notes: form.values.notes || null })); setEditing(false); reload(); }
  if (loading) return <div className="page"><SkeletonList rows={4} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Fornecedor não encontrado.'} retry={reload} /></div>;
  return <div className="page"><PageHeader icon={Store} title={data.name} action={<Button onClick={() => { form.reset({ name: data.name, notes: data.notes || '' }); setEditing(true); }}>Editar</Button>} />
    <div className="grid gap-5">{editing && <SectionCard title="Editar fornecedor"><form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(save); }}>{submitError && <ErrorState message={submitError} />}<FormErrorSummary errors={form.visibleErrors} /><Field label="Nome"><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} /></Field><Field label="Observação"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field><SubmitBar label="Salvar" busy={busy} secondary={<Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /></form></SectionCard>}
      <SectionCard title="Compras deste fornecedor">{!data.purchases.length ? <InlineEmpty>Nenhuma compra vinculada.</InlineEmpty> : <ScrollArea label="Compras do fornecedor">{data.purchases.map((purchase) => <Link className="mobile-item" key={purchase.id} to={`/compras/${purchase.id}`}><span><strong>{purchase.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(purchase.purchaseDate)}</span></span><strong>{formatMoney(purchase.totalAmount)}</strong></Link>)}</ScrollArea>}</SectionCard>
    </div>
  </div>;
}
