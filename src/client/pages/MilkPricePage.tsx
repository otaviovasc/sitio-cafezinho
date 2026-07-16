import { FormEvent, useEffect, useRef, useState } from 'react';
import { BadgeDollarSign, Pencil } from 'lucide-react';
import { formatLiters, formatMoney, parseDecimal } from '../../domain/format';
import { DecimalInput } from '../components/form-controls';
import { useToast } from '../components/feedback-context';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { Button, ErrorState, Field, FormErrorSummary, Input, LoadingState, PageHeader, ScrollArea, SectionCard, StatCard, Textarea } from '../components/ui';
import { useResource } from '../hooks/useResource';
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
  const formDirtyRef = useRef(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [monthError, setMonthError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: summary, loading, error, reload } = useResource<MilkPriceSummary>(`/api/milk-prices/summary?month=${month}`);
  const { data: history, loading: historyLoading, error: historyError, reload: reloadHistory } = useResource<MonthlyMilkPrice[]>('/api/milk-prices');

  useEffect(() => {
    if (!summary || summary.month !== month || formDirtyRef.current) return;
    setPrice(formatDecimalInput(summary.price?.pricePerLiter, 2, 4));
    setNotes(summary.price?.notes ?? '');
  }, [month, summary]);

  const selectedMonthHasPrice = Boolean(summary?.month === month && summary.price)
    || Boolean(history?.some((item) => item.month === month));

  function changeMonth(value: string) {
    formDirtyRef.current = false;
    setMonth(value);
    setPrice('');
    setNotes('');
    setFieldError('');
    setMonthError('');
    setSaveError('');
  }

  function editHistoricalPrice(item: MonthlyMilkPrice) {
    formDirtyRef.current = false;
    setMonth(item.month);
    setPrice(formatDecimalInput(item.pricePerLiter, 2, 4));
    setNotes(item.notes ?? '');
    setFieldError('');
    setMonthError('');
    setSaveError('');
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('monthly-milk-price')?.focus({ preventScroll: true });
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setFieldError('');
    setMonthError('');
    setSaveError('');
    if (!month) {
      setMonthError('Informe o mês do preço.');
      return;
    }
    const parsed = parseDecimal(price);
    if (parsed === null || parsed <= 0) {
      setFieldError('Informe um preço maior que zero.');
      return;
    }
    const wasEditing = selectedMonthHasPrice;
    setBusy(true);
    try {
      await api(`/api/milk-prices/${month}`, json('PUT', { pricePerLiter: parsed, notes: notes.trim() || null }));
      formDirtyRef.current = false;
      await Promise.all([reload(false), reloadHistory(false)]);
      toast(wasEditing ? 'Preço do leite atualizado' : 'Preço do leite registrado');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Não foi possível salvar o preço do leite.');
    } finally {
      setBusy(false);
    }
  }

  const chartData = (history ?? []).slice().reverse().map((item) => ({ date: `${item.month}-01`, price: Number(item.pricePerLiter) }));

  return <div className="page">
    <PageHeader icon={BadgeDollarSign} title="Preço do leite" subtitle="Informe um preço por mês para estimar o valor do leite coletado" />
    <div className="grid gap-5">
      <form ref={formRef} className="page-narrow grid w-full gap-4" noValidate onSubmit={(event) => void save(event)}>
        {saveError && <ErrorState message={saveError} />}
        <FormErrorSummary errors={[monthError, fieldError]} />
        <SectionCard title={`Preço de ${monthLabel(month)}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mês" error={monthError}><Input type="month" value={month} onChange={(event) => changeMonth(event.target.value)} required /></Field>
            <Field label="Preço por litro" hint="Pode ser corrigido quando o valor final for conhecido." error={fieldError}><DecimalInput id="monthly-milk-price" prefix="R$" suffix="/L" minimumFractionDigits={2} maximumFractionDigits={4} value={price} required onValueChange={(value) => { formDirtyRef.current = true; setPrice(value); setFieldError(''); }} placeholder="Ex.: 1,72" /></Field>
            <div className="sm:col-span-2"><Field label="Observação (opcional)"><Textarea value={notes} onChange={(event) => { formDirtyRef.current = true; setNotes(event.target.value); }} placeholder="Ex.: Preço informado pelo laticínio" /></Field></div>
          </div>
          <div className="form-submit-bar mt-4"><Button type="submit" disabled={busy || loading}>{busy ? 'Salvando…' : selectedMonthHasPrice ? 'Salvar alteração' : 'Salvar preço'}</Button></div>
        </SectionCard>
      </form>

      {loading ? <LoadingState /> : error || !summary ? <ErrorState message={error || 'Resumo do preço indisponível.'} retry={reload} /> : <>
        <section>
          <h2 className="mb-3 text-xl font-bold">Estimativa de {monthLabel(month)}</h2>
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
