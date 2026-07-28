import { parseDecimal } from '../../../domain/format';
import { LitersInput, MoneyInput } from '../../components/form-controls';
import { ChoiceCard, ErrorState, Field, FormErrorSummary, Input, SectionCard, Select, SubmitBar, Textarea } from '../../components/ui';
import type { Attachment } from '../../components/AttachmentPanel';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { revenueCategoryLabels, today } from '../../lib/labels';
import type { ReviewSubmit } from '../game/review';

type Animal = { id: string; name: string | null; tagNumber: string | null };
export type Revenue = { id: string; revenueDate: string; category: string; description: string; amount: string; status: string; receivedAt: string | null; animalId: string | null; animalName: string | null; tagNumber: string | null; buyerName: string | null; notes: string | null };
export type RevenueDetail = Revenue & { periodStart: string | null; periodEnd: string | null; quantity: string | null; unitPrice: string | null; bonusAmount: string; discountAmount: string; attachments: Attachment[] };

/** Pré-preenchimento do modo revisão (payload da ação proposta de receita). */
export type RevenueReviewInitial = {
  revenueDate: string;
  category: string;
  description: string;
  amount: string;
  status: string;
  buyerName: string;
  notes: string;
};

/**
 * Formulário real de receita/entrada (POST/PATCH /api/revenues), extraído de
 * FinancePages para ser montado também dentro da folha da Casa no jogo.
 * Com `review`, o submit confirma pela pipeline de revisão (commit da ação
 * proposta) em vez de gravar direto.
 */
export function RevenueForm({ initial, reviewInitial, review, initialAnimalId, onSaved }: {
  initial?: RevenueDetail;
  reviewInitial?: RevenueReviewInitial;
  review?: ReviewSubmit;
  initialAnimalId?: string;
  onSaved: (item: Revenue) => void;
}) {
  const { data: animals } = useResource<Animal[]>('/api/animals');
  const { busy, error, run } = useSubmit();
  const form = useForm(
    {
      revenueDate: initial?.revenueDate ?? reviewInitial?.revenueDate ?? today(),
      description: initial?.description ?? reviewInitial?.description ?? '',
      amount: initial?.amount ?? reviewInitial?.amount ?? '',
      received: initial?.status === 'RECEIVED' || reviewInitial?.status === 'RECEIVED',
      category: initial?.category ?? reviewInitial?.category ?? 'OTHER',
      animalId: initial?.animalId ?? initialAnimalId ?? '',
      periodStart: initial?.periodStart ?? '',
      periodEnd: initial?.periodEnd ?? '',
      quantity: initial?.quantity ?? '',
      unitPrice: initial?.unitPrice ?? '',
      bonusAmount: initial?.bonusAmount ?? '',
      discountAmount: initial?.discountAmount ?? '',
      buyerName: initial?.buyerName ?? reviewInitial?.buyerName ?? '',
      notes: initial?.notes ?? reviewInitial?.notes ?? '',
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
    if (review) {
      await review.onCommit(body);
      return;
    }
    const saved = await api<Revenue>(initial ? `/api/revenues/${initial.id}` : '/api/revenues', json(initial ? 'PATCH' : 'POST', body));
    onSaved(saved);
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>{error && <ErrorState message={error} />}<FormErrorSummary errors={form.visibleErrors} />
    <SectionCard title="Dados da entrada"><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Categoria"><Select value={form.values.category} onChange={(event) => form.set('category', event.target.value)}>{Object.entries(revenueCategoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field>
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
    <SubmitBar label={review?.label ?? (initial ? 'Salvar alterações' : 'Registrar entrada')} busy={busy} />
  </form>;
}
