import { useState } from 'react';
import { BadgeDollarSign, Banknote, CircleDollarSign, ShoppingCart } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, formatMoney, parseDecimal } from '../../domain/format';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { FinanceDirectionSwitch } from '../components/FinanceDirectionSwitch';
import { LitersInput, MoneyInput } from '../components/form-controls';
import { ConfirmButton } from '../components/feedback';
import { Button, ChoiceCard, ErrorState, Field, FormErrorSummary, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, StatCard, StatusBadge, SubmitBar, Textarea } from '../components/ui';
import { purchaseStatusDescriptor, revenueStatusDescriptor } from '../lib/status';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, json } from '../lib/api';
import { today } from '../lib/labels';

const categoryLabels: Record<string, string> = { MILK_SALE: 'Venda de leite', CALF_SALE: 'Venda de cria', CULL_SALE: 'Descarte', ANIMAL_SALE: 'Venda de animal', OTHER: 'Outra receita' };
type Animal = { id: string; name: string | null; tagNumber: string | null };
type Revenue = { id: string; revenueDate: string; category: string; description: string; amount: string; status: string; receivedAt: string | null; animalId: string | null; animalName: string | null; tagNumber: string | null; buyerName: string | null; notes: string | null };
type RevenueDetail = Revenue & { periodStart: string | null; periodEnd: string | null; quantity: string | null; unitPrice: string | null; bonusAmount: string; discountAmount: string; attachments: Attachment[] };
type FinancePurchase = { id: string; purchaseDate: string; description: string; category: string; totalAmount: string; status: string; isOverdue: boolean };
type FinanceSummary = { received: number; expected: number; paid: number; open: number; cashResult: number; overdue: number; overdueCount: number };

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return 'mês selecionado';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

function RevenueForm({ initial, initialAnimalId, onSaved }: { initial?: RevenueDetail; initialAnimalId?: string; onSaved: (item: Revenue) => void }) {
  const { data: animals } = useResource<Animal[]>('/api/animals');
  const { busy, error, run } = useSubmit();
  const form = useForm(
    {
      revenueDate: initial?.revenueDate ?? today(),
      description: initial?.description ?? '',
      amount: initial?.amount ?? '',
      received: initial?.status === 'RECEIVED',
      category: initial?.category ?? 'OTHER',
      animalId: initial?.animalId ?? initialAnimalId ?? '',
      periodStart: initial?.periodStart ?? '',
      periodEnd: initial?.periodEnd ?? '',
      quantity: initial?.quantity ?? '',
      unitPrice: initial?.unitPrice ?? '',
      bonusAmount: initial?.bonusAmount ?? '',
      discountAmount: initial?.discountAmount ?? '',
      buyerName: initial?.buyerName ?? '',
      notes: initial?.notes ?? '',
    },
    {
      revenueDate: (value) => (value ? undefined : 'Informe a data da entrada.'),
      description: (value) => (value.trim() ? undefined : 'Descreva de onde vem esta entrada.'),
      amount: (value) => {
        const parsed = parseDecimal(value);
        return parsed !== null && parsed > 0 ? undefined : 'Informe um valor maior que zero.';
      },
      periodEnd: (value, all) => (all.category === 'MILK_SALE' && all.periodStart && value && value < all.periodStart ? 'O fim não pode ser anterior ao início.' : undefined),
      quantity: (value, all) => {
        if (all.category !== 'MILK_SALE' || !value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed === null || parsed < 0 ? 'Informe uma quantidade válida.' : undefined;
      },
      unitPrice: (value, all) => {
        if (all.category !== 'MILK_SALE' || !value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed === null || parsed < 0 ? 'Informe um preço válido.' : undefined;
      },
      bonusAmount: (value, all) => {
        if (all.category !== 'MILK_SALE' || !value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed === null || parsed < 0 ? 'Informe uma bonificação válida.' : undefined;
      },
      discountAmount: (value, all) => {
        if (all.category !== 'MILK_SALE' || !value.trim()) return undefined;
        const parsed = parseDecimal(value);
        return parsed === null || parsed < 0 ? 'Informe um desconto válido.' : undefined;
      },
    },
  );
  useUnsavedGuard(form.dirty);

  async function persist() {
    const { revenueDate, category, description, amount, received, animalId, periodStart, periodEnd, quantity, unitPrice, bonusAmount, discountAmount, buyerName, notes } = form.values;
    const parsedAmount = parseDecimal(amount);
    if (parsedAmount === null) return;
    const body = {
      revenueDate, category, description, amount: parsedAmount, status: received ? 'RECEIVED' : initial?.status === 'CANCELLED' ? 'CANCELLED' : 'EXPECTED',
      receivedAt: received ? initial?.receivedAt ?? new Date().toISOString() : null, animalId: animalId || null,
      periodStart: periodStart || null, periodEnd: periodEnd || null, quantity: parseDecimal(quantity), unitPrice: parseDecimal(unitPrice),
      bonusAmount: parseDecimal(bonusAmount), discountAmount: parseDecimal(discountAmount), buyerName: buyerName.trim() || null, notes: notes.trim() || null,
    };
    const saved = await api<Revenue>(initial ? `/api/revenues/${initial.id}` : '/api/revenues', json(initial ? 'PATCH' : 'POST', body));
    onSaved(saved);
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>{error && <ErrorState message={error} />}<FormErrorSummary errors={form.visibleErrors} />
    <SectionCard title="Dados da entrada"><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Categoria"><Select value={form.values.category} onChange={(event) => form.set('category', event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field>
      <Field label="Data" error={form.error('revenueDate')}><Input type="date" value={form.values.revenueDate} required onChange={(event) => form.set('revenueDate', event.target.value)} onBlur={() => form.blur('revenueDate')} /></Field>
      <Field label="Descrição" hint="Ex.: Pagamento do leite de julho" error={form.error('description')}><Input value={form.values.description} required onChange={(event) => form.set('description', event.target.value)} onBlur={() => form.blur('description')} /></Field>
      <Field label="Valor da entrada" hint="Use o valor líquido que entrou ou será recebido." error={form.error('amount')}><MoneyInput value={form.values.amount} required onValueChange={(value) => form.set('amount', value)} onBlur={() => form.blur('amount')} placeholder="0,00" /></Field>
    </div></SectionCard>
    {initial?.status === 'CANCELLED' ? <div className="notice notice-warning">Esta receita está cancelada. Edite somente os dados; reabra o lançamento na tela de detalhes para mudar a situação.</div> : <SectionCard title="Situação do recebimento"><div className="grid gap-2 sm:grid-cols-2">
      <ChoiceCard name="revenue-status" value="received" checked={form.values.received} onChange={() => form.set('received', true)} title="Já recebi" description="Entra no caixa registrado agora" />
      <ChoiceCard name="revenue-status" value="expected" checked={!form.values.received} onChange={() => form.set('received', false)} title="Ainda vou receber" description="Fica separado como valor a receber" />
    </div></SectionCard>}
    {form.values.category === 'MILK_SALE' && <SectionCard title="Detalhes da venda de leite"><p className="mb-3 text-sm text-[var(--muted)]">Preencha somente o que estiver informado no relatório do laticínio.</p><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Início do período"><Input type="date" value={form.values.periodStart} onChange={(event) => form.set('periodStart', event.target.value)} /></Field>
      <Field label="Fim do período" error={form.error('periodEnd')}><Input type="date" value={form.values.periodEnd} onChange={(event) => form.set('periodEnd', event.target.value)} onBlur={() => form.blur('periodEnd')} /></Field>
      <Field label="Litros reconhecidos" error={form.error('quantity')}><LitersInput value={form.values.quantity} onValueChange={(value) => form.set('quantity', value)} onBlur={() => form.blur('quantity')} /></Field>
      <Field label="Preço-base por litro" error={form.error('unitPrice')}><MoneyInput value={form.values.unitPrice} onValueChange={(value) => form.set('unitPrice', value)} onBlur={() => form.blur('unitPrice')} /></Field>
      <Field label="Bonificações" error={form.error('bonusAmount')}><MoneyInput value={form.values.bonusAmount} onValueChange={(value) => form.set('bonusAmount', value)} onBlur={() => form.blur('bonusAmount')} /></Field>
      <Field label="Descontos" error={form.error('discountAmount')}><MoneyInput value={form.values.discountAmount} onValueChange={(value) => form.set('discountAmount', value)} onBlur={() => form.blur('discountAmount')} /></Field>
    </div></SectionCard>}
    <details className="section-card" open={Boolean(initial)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Informações opcionais</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label="Comprador"><Input value={form.values.buyerName} onChange={(event) => form.set('buyerName', event.target.value)} /></Field>
      <Field label="Animal vinculado"><Select value={form.values.animalId} onChange={(event) => form.set('animalId', event.target.value)}><option value="">Sem animal</option>{animals?.map((animal) => <option value={animal.id} key={animal.id}>{animal.name || `Brinco ${animal.tagNumber}`}</option>)}</Select></Field>
      <div className="sm:col-span-2"><Field label="Observações"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field></div>
    </div></details>
    <SubmitBar label={initial ? 'Salvar alterações' : 'Registrar entrada'} busy={busy} />
  </form>;
}

export function FinancePage() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data: summary, loading: summaryLoading, error: summaryError, reload: reloadSummary } = useResource<FinanceSummary>(`/api/finance-summary?month=${month}`);
  const { data: revenues, loading, error, reload } = useResource<Revenue[]>('/api/revenues');
  const { data: purchases, loading: purchasesLoading, error: purchasesError, reload: reloadPurchases } = useResource<FinancePurchase[]>('/api/purchases');
  return <div className="page"><PageHeader icon={Banknote} title="Financeiro" subtitle="Veja o que entrou, o que saiu e o que ainda está pendente" />
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link className="finance-action finance-action-income" to="/receitas/nova"><CircleDollarSign size={30} aria-hidden /><span><strong>Registrar entrada</strong><small>Venda de leite, animal ou outra receita</small></span></Link>
        <Link className="finance-action finance-action-expense" to="/compras/nova"><ShoppingCart size={30} aria-hidden /><span><strong>Registrar saída</strong><small>Compra, conta ou despesa da propriedade</small></span></Link>
        <Link className="finance-action finance-action-milk" to="/financeiro/preco-leite"><BadgeDollarSign size={30} aria-hidden /><span><strong>Preço do leite</strong><small>Valor mensal e estimativa sobre as coletas</small></span></Link>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">Resumo de {monthLabel(month)}</h2><p className="text-sm text-[var(--muted)]">Somente valores registrados neste sistema.</p></div><div className="w-full sm:w-48"><Field label="Mês do resumo"><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></Field></div></div>
      {summaryLoading ? <SkeletonList rows={3} /> : summaryError || !summary ? <ErrorState message={summaryError || 'Resumo indisponível.'} retry={reloadSummary} /> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Entradas recebidas" value={formatMoney(summary.received)} />
        <StatCard label="Saídas pagas" value={formatMoney(summary.paid)} />
        <StatCard label="Resultado de caixa registrado" value={formatMoney(summary.cashResult)} detail="Entradas recebidas menos saídas pagas. Não é lucro." />
        <StatCard label="A receber" value={formatMoney(summary.expected)} />
        <StatCard label="A pagar" value={formatMoney(summary.open)} />
        <StatCard label="Compras vencidas" value={formatMoney(summary.overdue)} detail={`${summary.overdueCount} compra(s)`} />
      </div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Entradas recentes" action={<Link className="button button-secondary" to="/receitas/nova">Nova entrada</Link>}>{loading ? <p className="py-6 text-center text-sm text-[var(--muted)]" role="status">Carregando entradas…</p> : error ? <ErrorState message={error} retry={reload} /> : !revenues?.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">Nenhuma entrada registrada.</p> : <ScrollArea label="Entradas recentes">{revenues.slice(0, 8).map((item) => <Link className="mobile-item" key={item.id} to={`/receitas/${item.id}`}><span className="min-w-0"><strong className="block truncate">{item.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.revenueDate)} · {categoryLabels[item.category]}</span></span><span className="shrink-0 text-right"><strong className="block">{formatMoney(item.amount)}</strong><StatusBadge descriptor={revenueStatusDescriptor[item.status]} /></span></Link>)}</ScrollArea>}</SectionCard>
        <SectionCard title="Saídas recentes" action={<Link className="button button-secondary" to="/compras">Ver todas</Link>}>{purchasesLoading ? <p className="py-6 text-center text-sm text-[var(--muted)]" role="status">Carregando saídas…</p> : purchasesError ? <ErrorState message={purchasesError} retry={reloadPurchases} /> : !purchases?.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">Nenhuma saída registrada.</p> : <ScrollArea label="Saídas recentes">{purchases.slice(0, 8).map((item) => <Link className="mobile-item" key={item.id} to={`/compras/${item.id}`}><span className="min-w-0"><strong className="block truncate">{item.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.purchaseDate)}</span></span><span className="shrink-0 text-right"><strong className="block">{formatMoney(item.totalAmount)}</strong><StatusBadge descriptor={purchaseStatusDescriptor(item.status, item.isOverdue)} /></span></Link>)}</ScrollArea>}</SectionCard>
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
  if (loading) return <div className="page"><SkeletonList rows={4} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Receita não encontrada.'} retry={reload} /></div>;
  if (editing) return <div className="page"><div className="page-narrow"><PageHeader icon={Banknote} title="Editar entrada" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><RevenueForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div></div>;
  return <div className="page"><PageHeader icon={Banknote} title={data.description} subtitle={`${formatDate(data.revenueDate)} · ${categoryLabels[data.category]}`} action={<Button onClick={() => setEditing(true)}>Editar</Button>} /><div className="grid gap-5">{actionError && <ErrorState message={actionError} />}<SectionCard><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Valor líquido da entrada</p><p className="text-3xl font-bold">{formatMoney(data.amount)}</p>{data.buyerName && <p className="mt-2 text-sm">Comprador: {data.buyerName}</p>}{data.animalId && <Link className="mt-2 block text-sm font-semibold text-[var(--primary)]" to={`/rebanho/${data.animalId}`}>Ver animal vinculado</Link>}</div><StatusBadge descriptor={revenueStatusDescriptor[data.status]} /></div>{data.notes && <p className="mt-4 text-sm">{data.notes}</p>}<div className="mt-4 flex flex-wrap gap-2">{data.status !== 'RECEIVED' && data.status !== 'CANCELLED' && <Button disabled={busy} onClick={() => void action('receive')}>Marcar como recebida</Button>}{data.status === 'RECEIVED' && <Button variant="secondary" disabled={busy} onClick={() => void action('expect')}>Voltar para a receber</Button>}{data.status === 'CANCELLED' && <Button variant="secondary" disabled={busy} onClick={() => void action('expect')}>Reabrir como a receber</Button>}{data.status !== 'CANCELLED' && <ConfirmButton variant="danger" disabled={busy} question="Cancelar esta entrada? Ela deixará de entrar nos totais." onClick={() => void action('cancel')}>Cancelar entrada</ConfirmButton>}</div></SectionCard>{data.category === 'MILK_SALE' && <SectionCard title="Detalhes do leite"><div className="grid gap-2 sm:grid-cols-2">{data.periodStart && <p>Período: <strong>{formatDate(data.periodStart)}{data.periodEnd ? ` a ${formatDate(data.periodEnd)}` : ''}</strong></p>}{data.quantity && <p>Litros reconhecidos: <strong>{Number(data.quantity).toLocaleString('pt-BR')}</strong></p>}{data.unitPrice && <p>Preço-base: <strong>{formatMoney(data.unitPrice)}/L</strong></p>}<p>Bonificações: <strong>{formatMoney(data.bonusAmount)}</strong></p><p>Descontos: <strong>{formatMoney(data.discountAmount)}</strong></p></div></SectionCard>}<SectionCard title="Comprovantes e relatórios"><AttachmentPanel attachments={data.attachments} revenueId={id} onChange={reload} /></SectionCard></div></div>;
}
