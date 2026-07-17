import { useEffect, useRef } from 'react';
import { BadgeDollarSign, Pencil } from 'lucide-react';
import { formatLiters, formatMoney, parseDecimal } from '../../domain/format';
import { DecimalInput } from '../components/form-controls';
import { useToast } from '../components/feedback-context';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { ErrorState, Field, FormErrorSummary, Input, LoadingState, PageHeader, ScrollArea, SectionCard, StatCard, SubmitBar, Textarea } from '../components/ui';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, json } from '../lib/api';
import { formatDecimalInput } from '../lib/form-format';
import { today } from '../lib/labels';

type MonthlyMilkPrice = {
  id: string;
  month: string;
  pricePerLiter: string;
  notes: string | null;
  updatedAt: string;
};

type MilkPriceSummary = {
  month: string;
  price: MonthlyMilkPrice | null;
  collection: {
    collectedLiters: number;
    collectionCount: number;
    pricePerLiter: number | null;
    estimatedValue: number | null;
    estimateBasis: 'COLLECTED_LITERS_X_MONTHLY_PRICE' | null;
  };
  production: { liters: number; measuredDays: number; averageOnMeasuredDays: number };
  limitations: string[];
};

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

function formatPrice(value: string | number) {
  return `${Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })}/L`;
}

export function MilkPricePage() {
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
  const { data: summary, loading, error, reload } = useResource<MilkPriceSummary>(`/api/milk-prices/summary?month=${form.values.month}`);
  const { data: history, loading: historyLoading, error: historyError, reload: reloadHistory } = useResource<MonthlyMilkPrice[]>('/api/milk-prices');

  useEffect(() => {
    if (!summary || summary.month !== form.values.month || form.dirty) return;
    form.reset({ month: form.values.month, price: formatDecimalInput(summary.price?.pricePerLiter, 2, 4), notes: summary.price?.notes ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const selectedMonthHasPrice = Boolean(summary?.month === form.values.month && summary.price)
    || Boolean(history?.some((item) => item.month === form.values.month));

  function changeMonth(value: string) {
    form.reset({ month: value, price: '', notes: '' });
  }

  function editHistoricalPrice(item: MonthlyMilkPrice) {
    form.reset({ month: item.month, price: formatDecimalInput(item.pricePerLiter, 2, 4), notes: item.notes ?? '' });
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('monthly-milk-price')?.focus({ preventScroll: true });
    });
  }

  async function persist() {
    const { month, price, notes } = form.values;
    const parsed = parseDecimal(price);
    if (parsed === null) return;
    const wasEditing = selectedMonthHasPrice;
    await api(`/api/milk-prices/${month}`, json('PUT', { pricePerLiter: parsed, notes: notes.trim() || null }));
    form.reset({ month, price, notes });
    await Promise.all([reload(false), reloadHistory(false)]);
    toast(wasEditing ? 'Preço do leite atualizado' : 'Preço do leite registrado');
  }

  const chartData = (history ?? []).slice().reverse().map((item) => ({ date: `${item.month}-01`, price: Number(item.pricePerLiter) }));

  return <div className="page">
    <PageHeader icon={BadgeDollarSign} title="Preço do leite" subtitle="Informe um preço por mês para estimar o valor do leite coletado" />
    <div className="grid gap-5">
      <form ref={formRef} className="page-narrow grid w-full gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
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
      </form>

      {loading ? <LoadingState /> : error || !summary ? <ErrorState message={error || 'Resumo do preço indisponível.'} retry={reload} /> : <>
        <section>
          <h2 className="mb-3 text-xl font-bold">Estimativa de {monthLabel(form.values.month)}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Preço informado" value={summary.price ? formatPrice(summary.price.pricePerLiter) : 'Não informado'} detail={summary.price ? 'Valor editável do mês' : 'Salve um preço para calcular'} />
            <StatCard label="Leite coletado" value={formatLiters(summary.collection.collectedLiters)} detail={`${summary.collection.collectionCount} coleta(s) registrada(s)`} />
            <StatCard label="Valor estimado" value={summary.collection.estimatedValue === null ? '—' : formatMoney(summary.collection.estimatedValue)} detail="Coleta registrada × preço mensal" />
            <StatCard label="Produção registrada" value={formatLiters(summary.production.liters)} detail={`${summary.production.measuredDays} dia(s) medido(s) · não usada na estimativa`} />
          </div>
          <div className="notice notice-info mt-3">Esta é uma estimativa sobre o leite coletado registrado. Não representa receita recebida e não inclui bonificações, descontos ou ajustes do laticínio.</div>
        </section>
      </>}

      <SectionCard title="Evolução do preço">
        {historyLoading ? <p className="py-6 text-center text-sm text-[var(--muted)]" role="status">Carregando histórico…</p> : historyError ? <ErrorState message={historyError} retry={reloadHistory} /> : !history?.length ? <div className="chart-empty">Nenhum preço mensal registrado.</div> : <>
          <TimeSeriesChart data={chartData} series={[{ key: 'price', label: 'Preço por litro', color: '#315c3b' }]} valuePrefix="R$ " valueSuffix="" startAtZero={false} label="Evolução mensal do preço do leite" />
          <ScrollArea label="Histórico de preços do leite" className="mt-3 max-h-72">
            {history.map((item) => <button className="mobile-item mobile-item-action" type="button" key={item.id} aria-label={`Editar preço de ${monthLabel(item.month)}`} onClick={() => editHistoricalPrice(item)}><span className="min-w-0"><strong className="block first-letter:uppercase">{monthLabel(item.month)}</strong>{item.notes && <span className="block truncate text-xs text-[var(--muted)]">{item.notes}</span>}</span><span className="shrink-0 text-right"><strong className="block">{formatPrice(item.pricePerLiter)}</strong><span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)]"><Pencil size={14} aria-hidden />Editar</span></span></button>)}
          </ScrollArea>
        </>}
      </SectionCard>
    </div>
  </div>;
}
