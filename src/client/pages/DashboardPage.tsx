import { AlertTriangle, BookOpen, CalendarClock, ChartNoAxesCombined, FileText, Home, Milk, RefreshCw, Scale, Tags, Upload, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatLiters, formatMoney } from '../../domain/format';
import { formatWeight } from '../../domain/weight';
import { CowHead } from '../components/icons';
import { TimeSeriesChart } from '../components/TimeSeriesChart';
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatCard } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { categoryLabels } from '../lib/labels';

type Dashboard = {
  dailyProduction: {
    latest: null | { id: string; productionDate: string; morningLiters: string | null; afternoonLiters: string | null; totalLiters: string; notes: string | null };
    month: { measuredDays: number; total: number; average: number };
    recent: Array<{ id: string; productionDate: string; totalLiters: string }>;
    comparison: { current: { measuredDays: number; total: number; average: number }; previous: { measuredDays: number; total: number; average: number }; previousMonth: string };
    timeline: Array<{ date: string; totalLiters: number; source: string }>;
  };
  production: null | { sessionId: string; sessionDate: string; confirmedTotal: number; confirmedCount: number; average: number; reviewCount: number; highest: Array<{ id: string; rawAnimalLabel: string; totalLiters: string }>; lowest: Array<{ id: string; rawAnimalLabel: string; totalLiters: string }>; trend: Array<{ sessionId: string; sessionDate: string; total: number }> };
  purchases: { monthTotal: number; previousMonthTotal: number; openCount: number; overdueCount: number; overdueTotal: number; upcoming: Array<{ id: string; description: string; dueDate: string; totalAmount: string }>; latest: Array<{ id: string; description: string; totalAmount: string; purchaseDate: string }>; categories: Array<[string, number]>; trend: Array<{ month: string; total: number }> };
  herd: { total: number; lactating: number; dry: number; heifers: number; withoutGroup: number; groups: Array<{ id: string; name: string; milkingRoutine: string; animalCount: number }> };
  weights: { latestDate: string | null; latestCount: number; latestAverage: number; reviewCount: number };
  attention: { milkReview: number; weightReview: number; overduePurchases: number; overdueTotal: number; lactatingWithoutGroup: number };
  documents: { standalone: number; errors: number; storageMode: string };
};

function percentageChange(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function ChangeDetail({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  const change = percentageChange(current, previous);
  if (change === null) return <span>Sem base no mês anterior</span>;
  const favorable = inverse ? change <= 0 : change >= 0;
  return <span className={favorable ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>{change > 0 ? '+' : ''}{change.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. mês anterior</span>;
}

export function DashboardPage() {
  const { data, loading, error, reload } = useResource<Dashboard>('/api/dashboard');
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Painel indisponível.'} retry={reload} /></div>;
  const attentionCount = data.attention.milkReview + data.attention.weightReview + data.attention.overduePurchases + data.attention.lactatingWithoutGroup;
  const productionChart = data.dailyProduction.timeline.map((row) => ({ date: row.date, total: row.totalLiters }));
  const purchaseChart = data.purchases.trend.map((row) => ({ date: `${row.month}-01`, total: row.total }));
  return <div className="page">
    <PageHeader icon={Home} title="Início" subtitle="Resumo operacional com dados registrados — sem preencher dias ausentes" />

    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Link className="quick-action quick-action-primary" to="/producao#total-diario"><Milk size={22} aria-hidden /><span><strong>Total do dia</strong><small>Registro rápido</small></span></Link>
      <Link className="quick-action" to="/producao/importar"><Upload size={22} aria-hidden /><span><strong>Controle individual</strong><small>Importar do ChatGPT</small></span></Link>
      <Link className="quick-action" to="/pesos/importar"><Scale size={22} aria-hidden /><span><strong>Nova pesagem</strong><small>Parcial ou completa</small></span></Link>
      <Link className="quick-action" to="/compras/nova"><WalletCards size={22} aria-hidden /><span><strong>Nova compra</strong><small>Menos de um minuto</small></span></Link>
      <Link className="quick-action col-span-2 lg:col-span-1" to="/rebanho/novo"><CowHead size={22} aria-hidden /><span><strong>Cadastrar rebanho</strong><small>Uma ou várias vacas</small></span></Link>
    </div>

    <div className="grid gap-5">
      <SectionCard icon={AlertTriangle} title={attentionCount ? `Atenção · ${attentionCount}` : 'Tudo em ordem'}>
        {!attentionCount ? <div className="notice notice-info">Não há revisões, contas vencidas ou vacas em lactação sem lote.</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.attention.milkReview > 0 && <Link className="attention-item" to="/producao"><Milk size={20} aria-hidden /><span><strong>{data.attention.milkReview} produção(ões)</strong><small>Aguardando revisão</small></span></Link>}
          {data.attention.weightReview > 0 && <Link className="attention-item" to="/pesos"><Scale size={20} aria-hidden /><span><strong>{data.attention.weightReview} peso(s)</strong><small>Aguardando revisão</small></span></Link>}
          {data.attention.overduePurchases > 0 && <Link className="attention-item attention-danger" to="/compras"><CalendarClock size={20} aria-hidden /><span><strong>{data.attention.overduePurchases} conta(s) vencida(s)</strong><small>{formatMoney(data.attention.overdueTotal)}</small></span></Link>}
          {data.attention.lactatingWithoutGroup > 0 && <Link className="attention-item" to="/rebanho"><Tags size={20} aria-hidden /><span><strong>{data.attention.lactatingWithoutGroup} sem lote</strong><small>Vacas em lactação</small></span></Link>}
        </div>}
      </SectionCard>

      <section><div className="mb-3 flex items-center gap-2"><ChartNoAxesCombined className="text-[var(--primary)]" size={20} aria-hidden /><h2 className="text-xl font-bold">Visão do mês</h2></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Produção média/dia medido" value={formatLiters(data.dailyProduction.comparison.current.average)} detail={<><span>{data.dailyProduction.comparison.current.measuredDays} dia(s) registrados</span><br /><ChangeDetail current={data.dailyProduction.comparison.current.average} previous={data.dailyProduction.comparison.previous.average} /></>} />
        <StatCard label="Produção registrada" value={formatLiters(data.dailyProduction.comparison.current.total)} detail="Total dos dias medidos no mês" />
        <StatCard label="Compras no mês" value={formatMoney(data.purchases.monthTotal)} detail={<ChangeDetail current={data.purchases.monthTotal} previous={data.purchases.previousMonthTotal} inverse />} />
        <StatCard label="Rebanho produtivo" value={`${data.herd.lactating} em lactação`} detail={`${data.herd.dry} seca(s) · ${data.herd.heifers} novilha(s) · ${data.herd.total} total`} />
      </div></section>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard icon={Milk} title="Produção nos últimos registros"><p className="mb-3 text-xs text-[var(--muted)]">Combina total diário e soma do controle individual. Dias sem medição ficam ausentes.</p><TimeSeriesChart data={productionChart} series={[{ key: 'total', label: 'Produção', color: '#315c3b', area: true }]} label="Produção total registrada" /><Link className="button button-secondary mt-3" to="/producao">Analisar produção</Link></SectionCard>
        <SectionCard icon={WalletCards} title="Compras nos últimos 3 meses"><p className="mb-3 text-xs text-[var(--muted)]">Somente compras não canceladas registradas no sistema.</p><TimeSeriesChart data={purchaseChart} series={[{ key: 'total', label: 'Compras', color: '#8a5a0a', area: true }]} valuePrefix="R$ " valueSuffix="" label="Compras registradas por mês" /><Link className="button button-secondary mt-3" to="/compras">Abrir compras</Link></SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard icon={CowHead} title="Rebanho e lotes"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><StatCard label="Em lactação" value={data.herd.lactating} /><StatCard label="Secas" value={data.herd.dry} /><StatCard label="Novilhas" value={data.herd.heifers} /><StatCard label="Total" value={data.herd.total} /></div><div className="mt-4">{data.herd.groups.map((group) => <div className="mobile-item" key={group.id}><span><strong>{group.name}</strong><span className="block text-xs text-[var(--muted)]">{group.milkingRoutine === 'MORNING_ONLY' ? 'Somente manhã' : 'Manhã e tarde'}</span></span><Badge tone="neutral">{group.animalCount} vaca(s)</Badge></div>)}</div><Link className="button button-secondary mt-3" to="/rebanho">Gerenciar rebanho</Link></SectionCard>
        <SectionCard icon={Scale} title="Última pesagem">{!data.weights.latestDate ? <EmptyState title="Nenhuma pesagem" description="Pesagens podem ser parciais e são revisadas antes de entrar no histórico." action={<Link className="button button-primary" to="/pesos/importar">Registrar pesagem</Link>} /> : <><div className="grid grid-cols-2 gap-3"><StatCard label="Data" value={formatDate(data.weights.latestDate)} /><StatCard label="Animais confirmados" value={data.weights.latestCount} /><StatCard label="Peso médio" value={formatWeight(data.weights.latestAverage)} /><StatCard label="A revisar" value={data.weights.reviewCount} /></div><Link className="button button-secondary mt-3" to="/pesos">Analisar pesos</Link></>}</SectionCard>
      </div>

      <SectionCard icon={WalletCards} title="Compras e vencimentos"><div className="grid grid-cols-3 gap-3"><StatCard label="Contas abertas" value={data.purchases.openCount} /><StatCard label="Vencidas" value={data.purchases.overdueCount} /><StatCard label="Total vencido" value={formatMoney(data.purchases.overdueTotal)} /></div>{data.purchases.upcoming.length > 0 && <div className="mt-4 min-w-0"><h3 className="text-sm font-bold">Próximos vencimentos</h3>{data.purchases.upcoming.map((purchase) => <Link to={`/compras/${purchase.id}`} className="mobile-item" key={purchase.id}><span className="min-w-0"><strong className="block truncate">{purchase.description}</strong><span className="text-xs text-[var(--muted)]">Vence {formatDate(purchase.dueDate)}</span></span><strong className="shrink-0">{formatMoney(purchase.totalAmount)}</strong></Link>)}</div>}<div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2"><div className="min-w-0"><h3 className="text-sm font-bold">Últimas compras</h3>{data.purchases.latest.slice(0, 4).map((purchase) => <Link to={`/compras/${purchase.id}`} className="mobile-item" key={purchase.id}><span className="min-w-0"><span className="block truncate">{purchase.description}</span><span className="text-xs text-[var(--muted)]">{formatDate(purchase.purchaseDate)}</span></span><strong className="shrink-0">{formatMoney(purchase.totalAmount)}</strong></Link>)}</div><div className="min-w-0"><h3 className="text-sm font-bold">Categorias no mês</h3>{data.purchases.categories.map(([category, total]) => <div className="mobile-item" key={category}><span className="min-w-0 truncate">{categoryLabels[category] ?? category}</span><strong className="shrink-0">{formatMoney(total)}</strong></div>)}</div></div></SectionCard>

      {data.production && <SectionCard icon={CowHead} title="Último controle individual"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Data" value={formatDate(data.production.sessionDate)} /><StatCard label="Total confirmado" value={formatLiters(data.production.confirmedTotal)} /><StatCard label="Vacas confirmadas" value={data.production.confirmedCount} /><StatCard label="Média por vaca" value={formatLiters(data.production.average)} /></div>{data.production.reviewCount > 0 && <div className="notice notice-warning mt-4">{data.production.reviewCount} medição(ões) aguardando revisão e fora do total.</div>}<Link className="button button-secondary mt-4" to={`/producao/${data.production.sessionId}`}>Revisar controle</Link></SectionCard>}

      <SectionCard icon={BookOpen} title="Guia rápido"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="guide-step"><span className="guide-number">1</span><Milk size={22} aria-hidden /><strong>Dia comum</strong><p>Registre manhã e tarde; o total é calculado.</p></div><div className="guide-step"><span className="guide-number">2</span><Upload size={22} aria-hidden /><strong>Dia de controle</strong><p>Importe manhã e tarde de todas as vacas em lactação.</p></div><div className="guide-step"><span className="guide-number">3</span><RefreshCw size={22} aria-hidden /><strong>Ciclo produtivo</strong><p>Registre seca, parto, cio e resultado da cobertura no animal.</p></div><div className="guide-step"><span className="guide-number">4</span><Scale size={22} aria-hidden /><strong>Pesagem</strong><p>Pode pesar somente parte do rebanho.</p></div><div className="guide-step"><span className="guide-number">5</span><WalletCards size={22} aria-hidden /><strong>Compras</strong><p>Uma compra pode ter nota, boleto e comprovante.</p></div></div></SectionCard>

      <SectionCard icon={FileText} title="Documentos"><div className="grid grid-cols-2 gap-3"><StatCard label="Avulsos" value={data.documents.standalone} /><StatCard label="Uploads com erro" value={data.documents.errors} /></div><p className="mt-3 text-sm text-[var(--muted)]">Armazenamento: {data.documents.storageMode === 'google_drive' ? 'Google Drive' : 'volume local persistente'}.</p></SectionCard>
    </div>
  </div>;
}
