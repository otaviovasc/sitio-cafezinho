import { FormEvent, useState } from 'react';
import { Banknote, CircleDollarSign, ShoppingCart } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, formatMoney, parseDecimal } from '../../domain/format';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { FinanceDirectionSwitch } from '../components/FinanceDirectionSwitch';
import { Badge, Button, ChoiceCard, ConfirmButton, ErrorState, Field, Input, LoadingState, PageHeader, ScrollArea, SectionCard, Select, StatCard, Textarea } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { today } from '../lib/labels';

const categoryLabels: Record<string, string> = { MILK_SALE: 'Venda de leite', CALF_SALE: 'Venda de cria', CULL_SALE: 'Descarte', ANIMAL_SALE: 'Venda de animal', OTHER: 'Outra receita' };
const statusLabels: Record<string, string> = { EXPECTED: 'A receber', RECEIVED: 'Recebida', CANCELLED: 'Cancelada' };
type Animal = { id: string; name: string | null; tagNumber: string | null };
type Revenue = { id: string; revenueDate: string; category: string; description: string; amount: string; status: string; receivedAt: string | null; animalId: string | null; animalName: string | null; tagNumber: string | null; buyerName: string | null; notes: string | null };
type RevenueDetail = Revenue & { periodStart: string | null; periodEnd: string | null; quantity: string | null; unitPrice: string | null; bonusAmount: string; discountAmount: string; attachments: Attachment[] };
type FinancePurchase = { id: string; purchaseDate: string; description: string; category: string; totalAmount: string; status: string; isOverdue: boolean };
type FinanceSummary = { received: number; expected: number; paid: number; open: number; cashResult: number; overdue: number; overdueCount: number };
type RevenueFieldErrors = Partial<Record<'revenueDate' | 'description' | 'amount' | 'periodEnd' | 'quantity' | 'unitPrice' | 'bonusAmount' | 'discountAmount', string>>;

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return 'mês selecionado';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

function purchaseStatus(item: FinancePurchase) {
  if (item.status === 'PAID') return { label: 'Paga', tone: 'success' as const };
  if (item.status === 'CANCELLED') return { label: 'Cancelada', tone: 'neutral' as const };
  if (item.isOverdue) return { label: 'Vencida', tone: 'danger' as const };
  return { label: 'A pagar', tone: 'warning' as const };
}

function RevenueForm({ initial, initialAnimalId, onSaved }: { initial?: RevenueDetail; initialAnimalId?: string; onSaved: (item: Revenue) => void }) {
  const { data: animals } = useResource<Animal[]>('/api/animals');
  const [revenueDate, setRevenueDate] = useState(initial?.revenueDate ?? today());
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [received, setReceived] = useState(initial?.status === 'RECEIVED');
  const [category, setCategory] = useState(initial?.category ?? 'OTHER');
  const [animalId, setAnimalId] = useState(initial?.animalId ?? initialAnimalId ?? '');
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? '');
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ?? '');
  const [bonusAmount, setBonusAmount] = useState(initial?.bonusAmount ?? '');
  const [discountAmount, setDiscountAmount] = useState(initial?.discountAmount ?? '');
  const [buyerName, setBuyerName] = useState(initial?.buyerName ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<RevenueFieldErrors>({});
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    const nextErrors: RevenueFieldErrors = {};
    const parsedAmount = parseDecimal(amount);
    const parsedQuantity = parseDecimal(quantity);
    const parsedUnitPrice = parseDecimal(unitPrice);
    const parsedBonus = parseDecimal(bonusAmount);
    const parsedDiscount = parseDecimal(discountAmount);
    if (!revenueDate) nextErrors.revenueDate = 'Informe a data da entrada.';
    if (!description.trim()) nextErrors.description = 'Descreva de onde vem esta entrada.';
    if (parsedAmount === null || parsedAmount <= 0) nextErrors.amount = 'Informe um valor maior que zero.';
    if (periodStart && periodEnd && periodEnd < periodStart) nextErrors.periodEnd = 'O fim não pode ser anterior ao início.';
    if (quantity.trim() && (parsedQuantity === null || parsedQuantity < 0)) nextErrors.quantity = 'Informe uma quantidade válida.';
    if (unitPrice.trim() && (parsedUnitPrice === null || parsedUnitPrice < 0)) nextErrors.unitPrice = 'Informe um preço válido.';
    if (bonusAmount.trim() && (parsedBonus === null || parsedBonus < 0)) nextErrors.bonusAmount = 'Informe uma bonificação válida.';
    if (discountAmount.trim() && (parsedDiscount === null || parsedDiscount < 0)) nextErrors.discountAmount = 'Informe um desconto válido.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length || parsedAmount === null) return;
    setBusy(true);
    try {
      const body = {
        revenueDate, category, description, amount: parsedAmount, status: received ? 'RECEIVED' : initial?.status === 'CANCELLED' ? 'CANCELLED' : 'EXPECTED',
        receivedAt: received ? initial?.receivedAt ?? new Date().toISOString() : null, animalId: animalId || null,
        periodStart: periodStart || null, periodEnd: periodEnd || null, quantity: parsedQuantity, unitPrice: parsedUnitPrice,
        bonusAmount: parsedBonus, discountAmount: parsedDiscount, buyerName: buyerName.trim() || null, notes: notes.trim() || null,
      };
      const saved = await api<Revenue>(initial ? `/api/revenues/${initial.id}` : '/api/revenues', json(initial ? 'PATCH' : 'POST', body));
      onSaved(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a receita.'); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-4" noValidate onSubmit={(event) => void save(event)}>{error && <ErrorState message={error} />}
    <SectionCard title="Dados da entrada"><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Categoria"><Select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field>
      <Field label="Data" error={fieldErrors.revenueDate}><Input type="date" value={revenueDate} onChange={(event) => { setRevenueDate(event.target.value); setFieldErrors((current) => ({ ...current, revenueDate: undefined })); }} /></Field>
      <Field label="Descrição" hint="Ex.: Pagamento do leite de julho" error={fieldErrors.description}><Input value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((current) => ({ ...current, description: undefined })); }} /></Field>
      <Field label="Valor da entrada" hint="Use o valor líquido que entrou ou será recebido." error={fieldErrors.amount}><Input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setFieldErrors((current) => ({ ...current, amount: undefined })); }} placeholder="0,00" /></Field>
    </div></SectionCard>
    {initial?.status === 'CANCELLED' ? <div className="notice notice-warning">Esta receita está cancelada. Edite somente os dados; reabra o lançamento na tela de detalhes para mudar a situação.</div> : <SectionCard title="Situação do recebimento"><div className="grid gap-2 sm:grid-cols-2">
      <ChoiceCard name="revenue-status" value="received" checked={received} onChange={() => setReceived(true)} title="Já recebi" description="Entra no caixa registrado agora" />
      <ChoiceCard name="revenue-status" value="expected" checked={!received} onChange={() => setReceived(false)} title="Ainda vou receber" description="Fica separado como valor a receber" />
    </div></SectionCard>}
    {category === 'MILK_SALE' && <SectionCard title="Detalhes da venda de leite"><p className="mb-3 text-sm text-[var(--muted)]">Preencha somente o que estiver informado no relatório do laticínio.</p><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Início do período"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field>
      <Field label="Fim do período" error={fieldErrors.periodEnd}><Input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); setFieldErrors((current) => ({ ...current, periodEnd: undefined })); }} /></Field>
      <Field label="Litros reconhecidos" error={fieldErrors.quantity}><Input inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setFieldErrors((current) => ({ ...current, quantity: undefined })); }} /></Field>
      <Field label="Preço-base por litro" error={fieldErrors.unitPrice}><Input inputMode="decimal" value={unitPrice} onChange={(event) => { setUnitPrice(event.target.value); setFieldErrors((current) => ({ ...current, unitPrice: undefined })); }} /></Field>
      <Field label="Bonificações" error={fieldErrors.bonusAmount}><Input inputMode="decimal" value={bonusAmount} onChange={(event) => { setBonusAmount(event.target.value); setFieldErrors((current) => ({ ...current, bonusAmount: undefined })); }} /></Field>
      <Field label="Descontos" error={fieldErrors.discountAmount}><Input inputMode="decimal" value={discountAmount} onChange={(event) => { setDiscountAmount(event.target.value); setFieldErrors((current) => ({ ...current, discountAmount: undefined })); }} /></Field>
    </div></SectionCard>}
    <details className="section-card" open={Boolean(initial)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Informações opcionais</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label="Comprador"><Input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} /></Field>
      <Field label="Animal vinculado"><Select value={animalId} onChange={(event) => setAnimalId(event.target.value)}><option value="">Sem animal</option>{animals?.map((animal) => <option value={animal.id} key={animal.id}>{animal.name || `Brinco ${animal.tagNumber}`}</option>)}</Select></Field>
      <div className="sm:col-span-2"><Field label="Observações"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>
    </div></details>
    <div className="form-submit-bar"><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Registrar entrada'}</Button></div>
  </form>;
}

export function FinancePage() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data: summary, loading: summaryLoading, error: summaryError, reload: reloadSummary } = useResource<FinanceSummary>(`/api/finance-summary?month=${month}`);
  const { data: revenues, loading, error, reload } = useResource<Revenue[]>('/api/revenues');
  const { data: purchases, loading: purchasesLoading, error: purchasesError, reload: reloadPurchases } = useResource<FinancePurchase[]>('/api/purchases');
  return <div className="page"><PageHeader icon={Banknote} title="Financeiro" subtitle="Veja o que entrou, o que saiu e o que ainda está pendente" />
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link className="finance-action finance-action-income" to="/receitas/nova"><CircleDollarSign size={30} aria-hidden /><span><strong>Registrar entrada</strong><small>Venda de leite, animal ou outra receita</small></span></Link>
        <Link className="finance-action finance-action-expense" to="/compras/nova"><ShoppingCart size={30} aria-hidden /><span><strong>Registrar saída</strong><small>Compra, conta ou despesa da propriedade</small></span></Link>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">Resumo de {monthLabel(month)}</h2><p className="text-sm text-[var(--muted)]">Somente valores registrados neste sistema.</p></div><div className="w-full sm:w-48"><Field label="Mês do resumo"><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></Field></div></div>
      {summaryLoading ? <LoadingState /> : summaryError || !summary ? <ErrorState message={summaryError || 'Resumo indisponível.'} retry={reloadSummary} /> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Entradas recebidas" value={formatMoney(summary.received)} />
        <StatCard label="Saídas pagas" value={formatMoney(summary.paid)} />
        <StatCard label="Resultado de caixa registrado" value={formatMoney(summary.cashResult)} detail="Entradas recebidas menos saídas pagas. Não é lucro." />
        <StatCard label="A receber" value={formatMoney(summary.expected)} />
        <StatCard label="A pagar" value={formatMoney(summary.open)} />
        <StatCard label="Compras vencidas" value={formatMoney(summary.overdue)} detail={`${summary.overdueCount} compra(s)`} />
      </div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Entradas recentes" action={<Link className="button button-secondary" to="/receitas/nova">Nova entrada</Link>}>{loading ? <p className="py-6 text-center text-sm text-[var(--muted)]" role="status">Carregando entradas…</p> : error ? <ErrorState message={error} retry={reload} /> : !revenues?.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">Nenhuma entrada registrada.</p> : <ScrollArea label="Entradas recentes">{revenues.slice(0, 8).map((item) => <Link className="mobile-item" key={item.id} to={`/receitas/${item.id}`}><span className="min-w-0"><strong className="block truncate">{item.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.revenueDate)} · {categoryLabels[item.category]}</span></span><span className="shrink-0 text-right"><strong className="block">{formatMoney(item.amount)}</strong><Badge tone={item.status === 'RECEIVED' ? 'success' : item.status === 'CANCELLED' ? 'neutral' : 'warning'}>{statusLabels[item.status]}</Badge></span></Link>)}</ScrollArea>}</SectionCard>
        <SectionCard title="Saídas recentes" action={<Link className="button button-secondary" to="/compras">Ver todas</Link>}>{purchasesLoading ? <p className="py-6 text-center text-sm text-[var(--muted)]" role="status">Carregando saídas…</p> : purchasesError ? <ErrorState message={purchasesError} retry={reloadPurchases} /> : !purchases?.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">Nenhuma saída registrada.</p> : <ScrollArea label="Saídas recentes">{purchases.slice(0, 8).map((item) => { const status = purchaseStatus(item); return <Link className="mobile-item" key={item.id} to={`/compras/${item.id}`}><span className="min-w-0"><strong className="block truncate">{item.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.purchaseDate)}</span></span><span className="shrink-0 text-right"><strong className="block">{formatMoney(item.totalAmount)}</strong><Badge tone={status.tone}>{status.label}</Badge></span></Link>; })}</ScrollArea>}</SectionCard>
      </div>
    </div>
  </div>;
}

export function NewRevenuePage() {
  const navigate = useNavigate();
  return <div className="page"><div className="page-narrow"><PageHeader icon={CircleDollarSign} title="Registrar entrada" subtitle="Venda ou receita que entrou — ou que ainda será recebida" /><div className="mb-4"><FinanceDirectionSwitch active="income" /></div><RevenueForm onSaved={(item) => navigate(`/receitas/${item.id}`, { replace: true })} /></div></div>;
}

export function RevenueDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<RevenueDetail>(`/api/revenues/${id}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  async function action(next: 'receive' | 'expect' | 'cancel') {
    setBusy(true); setActionError('');
    try {
      await api(`/api/revenues/${id}/actions`, json('POST', { action: next }));
      await reload();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a receita.'); }
    finally { setBusy(false); }
  }
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Receita não encontrada.'} retry={reload} /></div>;
  if (editing) return <div className="page"><div className="page-narrow"><PageHeader icon={Banknote} title="Editar entrada" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><RevenueForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div></div>;
  return <div className="page"><PageHeader icon={Banknote} title={data.description} subtitle={`${formatDate(data.revenueDate)} · ${categoryLabels[data.category]}`} action={<Button onClick={() => setEditing(true)}>Editar</Button>} /><div className="grid gap-5">{actionError && <ErrorState message={actionError} />}<SectionCard><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Valor líquido da entrada</p><p className="text-3xl font-bold">{formatMoney(data.amount)}</p>{data.buyerName && <p className="mt-2 text-sm">Comprador: {data.buyerName}</p>}{data.animalId && <Link className="mt-2 block text-sm font-semibold text-[var(--primary)]" to={`/rebanho/${data.animalId}`}>Ver animal vinculado</Link>}</div><Badge tone={data.status === 'RECEIVED' ? 'success' : data.status === 'CANCELLED' ? 'neutral' : 'warning'}>{statusLabels[data.status]}</Badge></div>{data.notes && <p className="mt-4 text-sm">{data.notes}</p>}<div className="mt-4 flex flex-wrap gap-2">{data.status !== 'RECEIVED' && data.status !== 'CANCELLED' && <Button disabled={busy} onClick={() => void action('receive')}>Marcar como recebida</Button>}{data.status === 'RECEIVED' && <Button variant="secondary" disabled={busy} onClick={() => void action('expect')}>Voltar para a receber</Button>}{data.status === 'CANCELLED' && <Button variant="secondary" disabled={busy} onClick={() => void action('expect')}>Reabrir como a receber</Button>}{data.status !== 'CANCELLED' && <ConfirmButton variant="danger" disabled={busy} question="Cancelar esta entrada? Ela deixará de entrar nos totais." onClick={() => void action('cancel')}>Cancelar entrada</ConfirmButton>}</div></SectionCard>{data.category === 'MILK_SALE' && <SectionCard title="Detalhes do leite"><div className="grid gap-2 sm:grid-cols-2">{data.periodStart && <p>Período: <strong>{formatDate(data.periodStart)}{data.periodEnd ? ` a ${formatDate(data.periodEnd)}` : ''}</strong></p>}{data.quantity && <p>Litros reconhecidos: <strong>{Number(data.quantity).toLocaleString('pt-BR')}</strong></p>}{data.unitPrice && <p>Preço-base: <strong>{formatMoney(data.unitPrice)}/L</strong></p>}<p>Bonificações: <strong>{formatMoney(data.bonusAmount)}</strong></p><p>Descontos: <strong>{formatMoney(data.discountAmount)}</strong></p></div></SectionCard>}<SectionCard title="Comprovantes e relatórios"><AttachmentPanel attachments={data.attachments} revenueId={id} onChange={reload} /></SectionCard></div></div>;
}
