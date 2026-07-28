import { useEffect, useRef } from 'react';
import { parseDecimal } from '../../../domain/format';
import { DecimalInput } from '../../components/form-controls';
import { useToast } from '../../components/feedback-context';
import { ErrorState, Field, FormErrorSummary, Input, SectionCard, SubmitBar, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { formatDecimalInput } from '../../lib/form-format';
import { today } from '../../lib/labels';
import { monthLabel, type MilkPriceSummary, type MonthlyMilkPrice } from './milk-price';

export type { MilkPriceSummary, MonthlyMilkPrice } from './milk-price';

/**
 * Formulário real do preço mensal do leite (PUT /api/milk-prices/:month),
 * extraído da MilkPricePage para ser montado também na folha da Casa no jogo.
 * O preço é um valor informado e editável, independente de produção, coleta e
 * receita. O mês vigente é informado ao pai via `onMonthChange` (a página usa
 * para os cartões de estimativa).
 */
export function MilkPriceForm({ editItem, knownMonthsWithPrice, onMonthChange, onSaved }: {
  /** Item do histórico escolhido para edição (preenche e foca o formulário). */
  editItem?: MonthlyMilkPrice | null;
  /** Meses com preço no histórico (complementa o resumo no rótulo do botão). */
  knownMonthsWithPrice?: string[];
  onMonthChange?: (month: string) => void;
  onSaved?: () => void | Promise<void>;
}) {
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const { busy, error: saveError, run } = useSubmit();
  const form = useForm(
    { month: today().slice(0, 7), price: '', notes: '' },
    {
      month: (value) => (value ? undefined : 'Informe o mês do preço.'),
      price: (value) => {
        const parsed = parseDecimal(value);
        return parsed !== null && parsed > 0 ? undefined : 'Informe um preço maior que zero.';
      },
    },
  );
  useUnsavedGuard(form.dirty);
  const { data: summary, loading } = useResource<MilkPriceSummary>(`/api/milk-prices/summary?month=${form.values.month}`);

  useEffect(() => {
    if (!summary || summary.month !== form.values.month || form.dirty) return;
    form.reset({ month: form.values.month, price: formatDecimalInput(summary.price?.pricePerLiter, 2, 4), notes: summary.price?.notes ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  useEffect(() => {
    if (!editItem) return;
    form.reset({ month: editItem.month, price: formatDecimalInput(editItem.pricePerLiter, 2, 4), notes: editItem.notes ?? '' });
    onMonthChange?.(editItem.month);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('monthly-milk-price')?.focus({ preventScroll: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem]);

  const selectedMonthHasPrice = Boolean(summary?.month === form.values.month && summary.price)
    || Boolean(knownMonthsWithPrice?.includes(form.values.month));

  function changeMonth(value: string) {
    form.reset({ month: value, price: '', notes: '' });
    onMonthChange?.(value);
  }

  async function persist() {
    const { month, price, notes } = form.values;
    const parsed = parseDecimal(price);
    if (parsed === null) return;
    const wasEditing = selectedMonthHasPrice;
    await api(`/api/milk-prices/${month}`, json('PUT', { pricePerLiter: parsed, notes: notes.trim() || null }));
    form.reset({ month, price, notes });
    await onSaved?.();
    toast(wasEditing ? 'Preço do leite atualizado' : 'Preço do leite registrado');
  }

  return <form ref={formRef} className="page-narrow grid w-full gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {saveError && <ErrorState message={saveError} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <SectionCard title={`Preço de ${monthLabel(form.values.month)}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mês" error={form.error('month')}><Input type="month" value={form.values.month} onChange={(event) => changeMonth(event.target.value)} required /></Field>
        <Field label="Preço por litro" hint="Pode ser corrigido quando o valor final for conhecido." error={form.error('price')}><DecimalInput id="monthly-milk-price" prefix="R$" suffix="/L" minimumFractionDigits={2} maximumFractionDigits={4} value={form.values.price} required onValueChange={(value) => form.set('price', value)} onBlur={() => form.blur('price')} placeholder="Ex.: 1,72" /></Field>
        <div className="sm:col-span-2"><Field label="Observação (opcional)"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} placeholder="Ex.: Preço informado pelo laticínio" /></Field></div>
      </div>
      <SubmitBar label={selectedMonthHasPrice ? 'Salvar alteração' : 'Salvar preço'} busy={busy} disabled={loading} />
    </SectionCard>
  </form>;
}
