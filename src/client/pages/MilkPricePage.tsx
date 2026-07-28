import { useState } from 'react';
import { BadgeDollarSign, Pencil } from 'lucide-react';
import { formatLiters, formatMoney } from '../../domain/format';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { ErrorState, LoadingState, PageHeader, ScrollArea, SectionCard, StatCard } from '../components/ui';
import { MilkPriceForm } from '../features/finance/MilkPriceForm';
import { formatMilkPrice, monthLabel, type MilkPriceSummary, type MonthlyMilkPrice } from '../features/finance/milk-price';
import { useResource } from '../hooks/useResource';
import { today } from '../lib/labels';

export function MilkPricePage() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [editItem, setEditItem] = useState<MonthlyMilkPrice | null>(null);
  const { data: summary, loading, error, reload } = useResource<MilkPriceSummary>(`/api/milk-prices/summary?month=${month}`);
  const { data: history, loading: historyLoading, error: historyError, reload: reloadHistory } = useResource<MonthlyMilkPrice[]>('/api/milk-prices');

  const chartData = (history ?? []).slice().reverse().map((item) => ({ date: `${item.month}-01`, price: Number(item.pricePerLiter) }));

  return <div className="page">
    <PageHeader icon={BadgeDollarSign} title="Preço do leite" subtitle="Informe um preço por mês para estimar o valor do leite coletado" />
    <div className="grid gap-5">
      <MilkPriceForm
        editItem={editItem}
        knownMonthsWithPrice={(history ?? []).map((item) => item.month)}
        onMonthChange={setMonth}
        onSaved={async () => { await Promise.all([reload(false), reloadHistory(false)]); }}
      />

      {loading ? <LoadingState /> : error || !summary ? <ErrorState message={error || 'Resumo do preço indisponível.'} retry={reload} /> : <>
        <section>
          <h2 className="mb-3 text-xl font-bold">Estimativa de {monthLabel(month)}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Preço informado" value={summary.price ? formatMilkPrice(summary.price.pricePerLiter) : 'Não informado'} detail={summary.price ? 'Valor editável do mês' : 'Salve um preço para calcular'} />
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
            {history.map((item) => <button className="mobile-item mobile-item-action" type="button" key={item.id} aria-label={`Editar preço de ${monthLabel(item.month)}`} onClick={() => setEditItem({ ...item })}><span className="min-w-0"><strong className="block first-letter:uppercase">{monthLabel(item.month)}</strong>{item.notes && <span className="block truncate text-xs text-[var(--muted)]">{item.notes}</span>}</span><span className="shrink-0 text-right"><strong className="block">{formatMilkPrice(item.pricePerLiter)}</strong><span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)]"><Pencil size={14} aria-hidden />Editar</span></span></button>)}
          </ScrollArea>
        </>}
      </SectionCard>
    </div>
  </div>;
}
