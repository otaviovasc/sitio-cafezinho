import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { parseDecimal } from '../../../domain/format';
import { MoneyInput } from '../../components/form-controls';
import { Button, ChoiceCard, ErrorState, Field, FormErrorSummary, Input, SectionCard, Select, SubmitBar, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { categoryLabels, today } from '../../lib/labels';
import type { Attachment } from '../../components/AttachmentPanel';
import type { ReviewSubmit } from '../game/review';

export type Supplier = { id: string; name: string; notes?: string | null };
export type PurchaseItem = { id: string; description: string; quantity: string; unit: string; unitPrice: string; totalPrice: string; notes: string | null };
export type PurchaseRecord = { id: string; supplierId: string | null; supplierName: string | null; purchaseDate: string; description: string; category: string; grossAmount?: string; discountAmount?: string; freightAmount?: string; totalAmount: string; dueDate: string | null; paidAt: string | null; status: string; notes: string | null; isOverdue: boolean };
export type PurchaseDetail = PurchaseRecord & { items: PurchaseItem[]; attachments: Attachment[]; itemsTotal: number; itemsDifference: number };

/** Pré-preenchimento do modo revisão (payload da ação proposta de compra). */
export type PurchaseReviewInitial = {
  purchaseDate: string;
  description: string;
  category: string;
  totalAmount: string;
  dueDate: string;
  supplierId: string;
  status: string;
  notes: string;
};

/**
 * Formulário real de compra/saída (POST/PATCH /api/purchases), extraído de
 * PurchasePages para ser montado também dentro da folha da Casa no jogo. Sem
 * `onSaved`, salvar navega para o detalhe da compra — o comportamento
 * histórico da página /compras/nova. Com `review`, o submit confirma pela
 * pipeline de revisão (commit da ação proposta) em vez de gravar direto.
 */
export function PurchaseForm({ initial, reviewInitial, review, onSaved }: {
  initial?: PurchaseDetail;
  reviewInitial?: PurchaseReviewInitial;
  review?: ReviewSubmit;
  onSaved?: (savedId: string) => void | Promise<void>;
}) {
  const { data: suppliers, reload: reloadSuppliers } = useResource<Supplier[]>('/api/suppliers');
  const { busy, error, run } = useSubmit();
  const form = useForm(
    {
      date: initial?.purchaseDate || reviewInitial?.purchaseDate || today(),
      description: initial?.description || reviewInitial?.description || '',
      category: initial?.category || reviewInitial?.category || 'FEED',
      total: initial?.totalAmount || reviewInitial?.totalAmount || '',
      dueDate: initial?.dueDate || reviewInitial?.dueDate || '',
      supplierId: initial?.supplierId || reviewInitial?.supplierId || '',
      gross: initial?.grossAmount || '',
      discount: initial?.discountAmount || '',
      freight: initial?.freightAmount || '',
      notes: initial?.notes || reviewInitial?.notes || '',
      paid: initial?.status === 'PAID' || reviewInitial?.status === 'PAID',
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
    const body = {
      purchaseDate: date, description, category, totalAmount: totalParsed, dueDate: !initial && paid ? null : dueDate || null,
      supplierId: supplierId || null, grossAmount: grossParsed ?? totalParsed,
      discountAmount: discountParsed ?? 0, freightAmount: freightParsed ?? 0,
      status: initial?.status || (paid ? 'PAID' : 'OPEN'), notes: notes || null,
    };
    if (review) {
      await review.onCommit(body);
      return;
    }
    const saved = await api<{ id: string }>(initial ? `/api/purchases/${initial.id}` : '/api/purchases', json(initial ? 'PATCH' : 'POST', body));
    if (onSaved) await onSaved(saved.id);
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
    <SubmitBar label={review?.label ?? (initial ? 'Salvar alterações' : 'Registrar saída')} busy={busy} />
  </form>;
}
