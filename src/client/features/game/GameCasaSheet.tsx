import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeDollarSign, CircleDollarSign, ShoppingCart, Store } from 'lucide-react';
import { formatDate, formatMoney } from '../../../domain/format';
import { AttachmentPanel } from '../../components/AttachmentPanel';
import { ErrorState, SkeletonList, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/feedback-context';
import { useResource } from '../../hooks/useResource';
import { MilkPriceForm } from '../finance/MilkPriceForm';
import { PurchaseForm, type PurchaseDetail, type PurchaseRecord } from '../finance/PurchaseForm';
import { RevenueForm, type Revenue, type RevenueDetail } from '../finance/RevenueForm';
import { SupplierForm } from '../finance/SupplierForm';
import { purchaseStatusDescriptor, revenueStatusDescriptor } from '../../lib/status';
import { categoryLabels, revenueCategoryLabels } from '../../lib/labels';
import { GameEntitySheet, type GameEntityAction } from './GameEntitySheet';
import { GameReviewNotice } from './GameReviewNotice';
import { commitReviewAction, type SheetReview } from './review';
import { CasaSprite } from './sprites/CasaSprite';

type SheetView = 'menu' | 'purchase' | 'revenue' | 'price' | 'supplier' | 'purchaseDetail' | 'revenueDetail' | 'reviewPurchase' | 'reviewRevenue';

/** Detalhe de um fato financeiro na folha: resumo + anexar documento (foto). */
function CasaPurchaseDetail({ purchaseId, onBack }: { purchaseId: string; onBack: () => void }) {
  const { data, loading, error, reload } = useResource<PurchaseDetail>(`/api/purchases/${purchaseId}`);
  if (loading && !data) return <><button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button><SkeletonList rows={3} /></>;
  if (error || !data) return <><button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button><ErrorState message={error || 'Compra não encontrada.'} retry={() => void reload()} /></>;
  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button>
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-lg">{data.description}</strong>
        <StatusBadge descriptor={purchaseStatusDescriptor(data.status, data.isOverdue)} />
      </div>
      <p className="game-notebook-subtitle">{formatDate(data.purchaseDate)} · {categoryLabels[data.category] ?? data.category} · {formatMoney(data.totalAmount)}</p>
    </div>
    <dl className="game-notebook-fields mb-3">
      <div><dt>Fornecedor</dt><dd>{data.supplierName ?? 'Sem fornecedor'}</dd></div>
      <div><dt>Vencimento</dt><dd>{data.dueDate ? formatDate(data.dueDate) : '—'}</dd></div>
    </dl>
    <p className="game-notebook-heading mb-2">Nota, boleto e comprovante</p>
    <AttachmentPanel attachments={data.attachments} purchaseId={purchaseId} onChange={() => void reload(false)} />
    <Link className="game-notebook-link" to={`/compras/${data.id}`}>Abrir compra no app</Link>
  </>;
}

function CasaRevenueDetail({ revenueId, onBack }: { revenueId: string; onBack: () => void }) {
  const { data, loading, error, reload } = useResource<RevenueDetail>(`/api/revenues/${revenueId}`);
  if (loading && !data) return <><button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button><SkeletonList rows={3} /></>;
  if (error || !data) return <><button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button><ErrorState message={error || 'Receita não encontrada.'} retry={() => void reload()} /></>;
  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button>
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-lg">{data.description}</strong>
        <StatusBadge descriptor={revenueStatusDescriptor[data.status]} />
      </div>
      <p className="game-notebook-subtitle">{formatDate(data.revenueDate)} · {revenueCategoryLabels[data.category] ?? data.category} · {formatMoney(data.amount)}</p>
    </div>
    <p className="game-notebook-heading mb-2">Comprovantes e relatórios</p>
    <AttachmentPanel attachments={data.attachments} revenueId={revenueId} onChange={() => void reload(false)} />
    <Link className="game-notebook-link" to={`/receitas/${data.id}`}>Abrir receita no app</Link>
  </>;
}

/**
 * Folha da Casa: o escritório do sítio. Pendências do mês derivadas dos
 * endpoints reais (compras em aberto/vencidas, receitas esperadas) e os
 * formulários reais do financeiro — compra genérica, receita, preço do leite
 * do mês e cadastro rápido de fornecedor. Tocar numa pendência abre o fato
 * com o painel de documentos (foto → attachments), o mesmo do app.
 * Em modo revisão, a compra/receita falada abre preenchida e confirma pela
 * pipeline de revisão.
 */
export function GameCasaSheet({ open, review, onClose, onChanged }: {
  open: boolean;
  review?: SheetReview;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<SheetView>('menu');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: purchases, loading: purchasesLoading, error: purchasesError, reload: reloadPurchases } = useResource<PurchaseRecord[]>('/api/purchases');
  const { data: revenues, loading: revenuesLoading, error: revenuesError, reload: reloadRevenues } = useResource<Revenue[]>('/api/revenues');

  useEffect(() => {
    if (open && review) setView(review.action.actionType === 'REVENUE' ? 'reviewRevenue' : 'reviewPurchase');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const openPurchases = (purchases ?? []).filter((purchase) => purchase.status === 'OPEN');
  const expectedRevenues = (revenues ?? []).filter((revenue) => revenue.status === 'EXPECTED');
  const payload = review?.action.resolvedPayload ?? {};

  function handleChanged() {
    void reloadPurchases(false);
    void reloadRevenues(false);
    onChanged();
  }

  function backToMenu() {
    setView('menu');
    setSelectedId(null);
  }

  async function handleCommit(nextPayload: Record<string, unknown>) {
    if (!review) return;
    await commitReviewAction(review.action, { ...review.action.resolvedPayload, ...nextPayload });
    review.onDone('committed');
  }

  const actions: GameEntityAction[] = [
    { icon: <ShoppingCart size={22} aria-hidden />, label: 'Registrar compra', hint: 'Compra, conta ou despesa — paga ou a pagar.', testid: 'game-casa-new-purchase', onClick: () => setView('purchase') },
    { icon: <CircleDollarSign size={22} aria-hidden />, label: 'Registrar receita', hint: 'Venda de leite, animal ou outra entrada.', testid: 'game-casa-new-revenue', onClick: () => setView('revenue') },
    { icon: <BadgeDollarSign size={22} aria-hidden />, label: 'Preço do leite do mês', hint: 'Valor informado por litro, editável a qualquer momento.', testid: 'game-casa-milk-price', onClick: () => setView('price') },
    { icon: <Store size={22} aria-hidden />, label: 'Novo fornecedor', hint: 'Cadastro rápido para vincular às compras.', testid: 'game-casa-new-supplier', onClick: () => setView('supplier') },
  ];

  return <GameEntitySheet open={open} label="Casa" testid="game-casa-sheet" title="Casa" subtitle={review ? 'Revise o lançamento que o assistente entendeu.' : 'O escritório do sítio: contas, receitas e fornecedores.'} onClose={onClose} sprite={<CasaSprite x={32} y={32} size={64} />} actions={view === 'menu' ? actions : undefined}>
    {view === 'reviewPurchase' && review && <>
      <GameReviewNotice action={review.action} onDone={review.onDone} />
      <PurchaseForm
        reviewInitial={{
          purchaseDate: String(payload.purchaseDate ?? ''),
          description: String(payload.description ?? ''),
          category: String(payload.category ?? 'OTHER'),
          totalAmount: payload.totalAmount !== null && payload.totalAmount !== undefined ? String(payload.totalAmount) : '',
          dueDate: payload.dueDate ? String(payload.dueDate) : '',
          supplierId: payload.supplierId ? String(payload.supplierId) : '',
          status: String(payload.status ?? 'OPEN'),
          notes: payload.notes ? String(payload.notes) : '',
        }}
        review={{ label: 'Confirmar compra', onCommit: handleCommit }}
        onSaved={() => undefined}
      />
    </>}
    {view === 'reviewRevenue' && review && <>
      <GameReviewNotice action={review.action} onDone={review.onDone} />
      <RevenueForm
        reviewInitial={{
          revenueDate: String(payload.revenueDate ?? ''),
          category: String(payload.category ?? 'OTHER'),
          description: String(payload.description ?? ''),
          amount: payload.amount !== null && payload.amount !== undefined ? String(payload.amount) : '',
          status: String(payload.status ?? 'EXPECTED'),
          buyerName: payload.buyerName ? String(payload.buyerName) : '',
          notes: payload.notes ? String(payload.notes) : '',
        }}
        review={{ label: 'Confirmar receita', onCommit: handleCommit }}
        onSaved={() => undefined}
      />
    </>}
    {view === 'purchase' && <>
      <button type="button" className="game-sheet-back" onClick={backToMenu}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button>
      <PurchaseForm onSaved={() => { toast('Compra registrada'); backToMenu(); handleChanged(); }} />
    </>}
    {view === 'revenue' && <>
      <button type="button" className="game-sheet-back" onClick={backToMenu}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button>
      <RevenueForm onSaved={() => { toast('Receita registrada'); backToMenu(); handleChanged(); }} />
    </>}
    {view === 'price' && <>
      <button type="button" className="game-sheet-back" onClick={backToMenu}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button>
      <MilkPriceForm onSaved={handleChanged} />
    </>}
    {view === 'supplier' && <>
      <button type="button" className="game-sheet-back" onClick={backToMenu}><ArrowLeft size={16} aria-hidden />Voltar ao escritório</button>
      <SupplierForm onSaved={() => { toast('Fornecedor cadastrado'); backToMenu(); }} />
    </>}
    {view === 'purchaseDetail' && selectedId && <CasaPurchaseDetail purchaseId={selectedId} onBack={backToMenu} />}
    {view === 'revenueDetail' && selectedId && <CasaRevenueDetail revenueId={selectedId} onBack={backToMenu} />}

    {view === 'menu' && <div className="grid gap-4">
      <div className="grid gap-1.5">
        <p className="game-notebook-heading">A pagar</p>
        {purchasesLoading && !purchases && <SkeletonList rows={2} />}
        {purchasesError && <ErrorState message={purchasesError} retry={() => void reloadPurchases()} />}
        {purchases && !openPurchases.length && <p className="game-notebook-empty">Nenhuma conta em aberto.</p>}
        {openPurchases.map((purchase) => <button key={purchase.id} type="button" className="game-sheet-action" data-testid={`game-casa-purchase-${purchase.id}`} onClick={() => { setSelectedId(purchase.id); setView('purchaseDetail'); }}>
          <span className="min-w-0 flex-1 text-left"><strong>{purchase.description}</strong><small>{purchase.supplierName ?? 'Sem fornecedor'}{purchase.dueDate ? ` · vence ${formatDate(purchase.dueDate)}` : ''}</small></span>
          <span className="shrink-0 text-right"><strong className="block">{formatMoney(purchase.totalAmount)}</strong><StatusBadge descriptor={purchaseStatusDescriptor(purchase.status, purchase.isOverdue)} /></span>
        </button>)}
      </div>
      <div className="grid gap-1.5">
        <p className="game-notebook-heading">A receber</p>
        {revenuesLoading && !revenues && <SkeletonList rows={2} />}
        {revenuesError && <ErrorState message={revenuesError} retry={() => void reloadRevenues()} />}
        {revenues && !expectedRevenues.length && <p className="game-notebook-empty">Nenhuma receita esperada.</p>}
        {expectedRevenues.map((revenue) => <button key={revenue.id} type="button" className="game-sheet-action" data-testid={`game-casa-revenue-${revenue.id}`} onClick={() => { setSelectedId(revenue.id); setView('revenueDetail'); }}>
          <span className="min-w-0 flex-1 text-left"><strong>{revenue.description}</strong><small>{formatDate(revenue.revenueDate)} · {revenueCategoryLabels[revenue.category] ?? revenue.category}</small></span>
          <span className="shrink-0 text-right"><strong className="block">{formatMoney(revenue.amount)}</strong><StatusBadge descriptor={revenueStatusDescriptor[revenue.status]} /></span>
        </button>)}
      </div>
    </div>}
  </GameEntitySheet>;
}
