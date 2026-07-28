import { useState } from 'react';
import { BadgeDollarSign, Banknote, CircleDollarSign, Package, ShoppingCart } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, formatMoney } from '../../domain/format';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { FinanceDirectionSwitch } from '../components/FinanceDirectionSwitch';
import { ConfirmButton } from '../components/feedback';
import { Button, ErrorState, Field, Input, PageHeader, ScrollArea, SectionCard, SkeletonList, StatCard, StatusBadge } from '../components/ui';
import { RevenueForm, type Revenue, type RevenueDetail } from '../features/finance/RevenueForm';
import { purchaseStatusDescriptor, revenueStatusDescriptor } from '../lib/status';
import { useResource } from '../hooks/useResource';
import { api, json } from '../lib/api';
import { revenueCategoryLabels, today } from '../lib/labels';

type FinancePurchase = { id: string; purchaseDate: string; description: string; category: string; totalAmount: string; status: string; isOverdue: boolean };
type FinanceSummary = { received: number; expected: number; paid: number; open: number; cashResult: number; overdue: number; overdueCount: number };

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return 'mês selecionado';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function FinancePage() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data: summary, loading: summaryLoading, error: summaryError, reload: reloadSummary } = useResource<FinanceSummary>(`/api/finance-summary?month=${month}`);
  const { data: revenues, loading, error, reload } = useResource<Revenue[]>('/api/revenues');
  const { data: purchases, loading: purchasesLoading, error: purchasesError, reload: reloadPurchases } = useResource<FinancePurchase[]>('/api/purchases');
  return <div className="page"><PageHeader icon={Banknote} title="Financeiro" subtitle="Veja o que entrou, o que saiu e o que ainda está pendente" />
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link className="finance-action finance-action-income" to="/receitas/nova"><CircleDollarSign size={30} aria-hidden /><span><strong>Registrar entrada</strong><small>Venda de leite, animal ou outra receita</small></span></Link>
        <Link className="finance-action finance-action-expense" to="/compras/nova"><ShoppingCart size={30} aria-hidden /><span><strong>Registrar saída</strong><small>Compra, conta ou despesa da propriedade</small></span></Link>
        <Link className="finance-action finance-action-stock" to="/compras"><Package size={30} aria-hidden /><span><strong>Compras e estoque</strong><small>Compras, alimentos, catálogo e fornecedores</small></span></Link>
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
        <SectionCard title="Entradas recentes" action={<Link className="button button-secondary" to="/receitas/nova">Nova entrada</Link>}>{loading ? <p className="py-6 text-center text-sm text-[var(--muted)]" role="status">Carregando entradas…</p> : error ? <ErrorState message={error} retry={reload} /> : !revenues?.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">Nenhuma entrada registrada.</p> : <ScrollArea label="Entradas recentes">{revenues.slice(0, 8).map((item) => <Link className="mobile-item" key={item.id} to={`/receitas/${item.id}`}><span className="min-w-0"><strong className="block truncate">{item.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.revenueDate)} · {revenueCategoryLabels[item.category]}</span></span><span className="shrink-0 text-right"><strong className="block">{formatMoney(item.amount)}</strong><StatusBadge descriptor={revenueStatusDescriptor[item.status]} /></span></Link>)}</ScrollArea>}</SectionCard>
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
  return <div className="page"><PageHeader icon={Banknote} title={data.description} subtitle={`${formatDate(data.revenueDate)} · ${revenueCategoryLabels[data.category]}`} action={<Button onClick={() => setEditing(true)}>Editar</Button>} /><div className="grid gap-5">{actionError && <ErrorState message={actionError} />}<SectionCard><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Valor líquido da entrada</p><p className="text-3xl font-bold">{formatMoney(data.amount)}</p>{data.buyerName && <p className="mt-2 text-sm">Comprador: {data.buyerName}</p>}{data.animalId && <Link className="mt-2 block text-sm font-semibold text-[var(--primary)]" to={`/rebanho/${data.animalId}`}>Ver animal vinculado</Link>}</div><StatusBadge descriptor={revenueStatusDescriptor[data.status]} /></div>{data.notes && <p className="mt-4 text-sm">{data.notes}</p>}<div className="mt-4 flex flex-wrap gap-2">{data.status !== 'RECEIVED' && data.status !== 'CANCELLED' && <Button disabled={busy} onClick={() => void action('receive')}>Marcar como recebida</Button>}{data.status === 'RECEIVED' && <Button variant="secondary" disabled={busy} onClick={() => void action('expect')}>Voltar para a receber</Button>}{data.status === 'CANCELLED' && <Button variant="secondary" disabled={busy} onClick={() => void action('expect')}>Reabrir como a receber</Button>}{data.status !== 'CANCELLED' && <ConfirmButton variant="danger" disabled={busy} question="Cancelar esta entrada? Ela deixará de entrar nos totais." onClick={() => void action('cancel')}>Cancelar entrada</ConfirmButton>}</div></SectionCard>{data.category === 'MILK_SALE' && <SectionCard title="Detalhes do leite"><div className="grid gap-2 sm:grid-cols-2">{data.periodStart && <p>Período: <strong>{formatDate(data.periodStart)}{data.periodEnd ? ` a ${formatDate(data.periodEnd)}` : ''}</strong></p>}{data.quantity && <p>Litros reconhecidos: <strong>{Number(data.quantity).toLocaleString('pt-BR')}</strong></p>}{data.unitPrice && <p>Preço-base: <strong>{formatMoney(data.unitPrice)}/L</strong></p>}<p>Bonificações: <strong>{formatMoney(data.bonusAmount)}</strong></p><p>Descontos: <strong>{formatMoney(data.discountAmount)}</strong></p></div></SectionCard>}<SectionCard title="Comprovantes e relatórios"><AttachmentPanel attachments={data.attachments} revenueId={id} onChange={reload} /></SectionCard></div></div>;
}
