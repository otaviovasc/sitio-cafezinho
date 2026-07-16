import { Activity, AlertTriangle, Banknote, CalendarClock, FileText, Home, Milk, Plus, Truck, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatLiters, formatMoney } from '../../domain/format';
import { CowHead } from '../components/icons';
import { Badge, ErrorState, LoadingState, PageHeader, SectionCard, StatCard } from '../components/ui';
import { useResource } from '../hooks/useResource';

type Dashboard = {
  date: string;
  today: {
    production: null | { productionDate: string; totalLiters: number; basis: 'HERD_TOTAL' | 'GROUP_SUM'; groupCount: number };
    collectionCount: number;
    milk: { productionLiters: number | null; collectedLiters: number; differenceLiters: number | null };
    activeTreatmentCount: number;
    activeCaseCount: number;
    actionsToday: number;
    overdueActions: number;
    withdrawals: Array<{ caseId: string; animalId: string; animalName: string | null; tagNumber: string | null; withdrawalEndsAt: string; days: number; state: string }>;
  };
  attention: { productionMissing: boolean; productionGroupsMissing: number; collectionMissing: boolean; mastitisActionsToday: number; overdueMastitisActions: number; withdrawals: number; purchasesDueTomorrow: number; overduePurchases: number; overdueTotal: number; milkReview: number; weightReview: number; standaloneDocuments: number; lactatingWithoutGroup: number };
  month: { productionLiters: number; productionDays: number; collectionLiters: number; revenuesReceived: number; revenuesExpected: number; expensesPaid: number; purchasesOpen: number; cashResult: number; mastitisCases: number };
  herd: { total: number; lactating: number; dry: number; heifers: number; groups: Array<{ id: string; name: string; milkingRoutine: string; animalCount: number }> };
  latestIndividualControl: null | { id: string; sessionDate: string; confirmedTotal: number; reviewCount: number };
  documents: { errors: number; storageMode: string };
};

export function DashboardPage() {
  const { data, loading, error, reload } = useResource<Dashboard>('/api/dashboard');
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Painel indisponível.'} retry={reload} /></div>;
  const attentionCount = Number(data.attention.productionMissing) + data.attention.productionGroupsMissing + Number(data.attention.collectionMissing) + data.attention.mastitisActionsToday + data.attention.overdueMastitisActions + data.attention.withdrawals + data.attention.purchasesDueTomorrow + data.attention.overduePurchases + data.attention.milkReview + data.attention.weightReview + data.attention.standaloneDocuments + data.attention.lactatingWithoutGroup;
  return <div className="page"><PageHeader icon={Home} title="Hoje" subtitle={`${formatDate(data.date)} · o que precisa ser registrado ou resolvido`} />
    <div className="grid gap-5">
      <SectionCard icon={AlertTriangle} title={attentionCount ? `Precisa de atenção · ${attentionCount}` : 'Nenhuma pendência importante para hoje'}>
        {!attentionCount ? <div className="notice notice-info">Nenhuma pendência importante para hoje.</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.attention.productionMissing && <Link className="attention-item" to="/producao#total-diario"><Milk size={20} aria-hidden /><span><strong>Produção de hoje ainda não registrada</strong><small>Abrir registro agregado</small></span></Link>}
          {data.attention.productionGroupsMissing > 0 && <Link className="attention-item" to="/producao#total-diario"><Milk size={20} aria-hidden /><span><strong>{data.attention.productionGroupsMissing} lote(s) sem produção de hoje</strong><small>Completar registros por lote</small></span></Link>}
          {data.attention.collectionMissing && <Link className="attention-item" to="/producao/coletas/nova"><Truck size={20} aria-hidden /><span><strong>Coleta de hoje ainda não registrada</strong><small>Registrar litros retirados</small></span></Link>}
          {data.attention.mastitisActionsToday > 0 && <Link className="attention-item" to="/mastite"><Activity size={20} aria-hidden /><span><strong>{data.attention.mastitisActionsToday} ação(ões) de mastite para hoje</strong><small>Abrir casos</small></span></Link>}
          {data.attention.overdueMastitisActions > 0 && <Link className="attention-item attention-danger" to="/mastite"><Activity size={20} aria-hidden /><span><strong>{data.attention.overdueMastitisActions} ação(ões) atrasada(s)</strong><small>Atualizar ações</small></span></Link>}
          {data.attention.withdrawals > 0 && <Link className="attention-item" to="/mastite"><Activity size={20} aria-hidden /><span><strong>{data.attention.withdrawals} vaca(s) com carência informada</strong><small>Confirmar antes de liberar o leite</small></span></Link>}
          {data.attention.purchasesDueTomorrow > 0 && <Link className="attention-item" to="/compras"><CalendarClock size={20} aria-hidden /><span><strong>{data.attention.purchasesDueTomorrow} conta(s) vence(m) amanhã</strong><small>Abrir compras</small></span></Link>}
          {data.attention.overduePurchases > 0 && <Link className="attention-item attention-danger" to="/compras"><CalendarClock size={20} aria-hidden /><span><strong>{data.attention.overduePurchases} conta(s) vencida(s)</strong><small>{formatMoney(data.attention.overdueTotal)}</small></span></Link>}
          {data.attention.milkReview > 0 && <Link className="attention-item" to="/producao"><Milk size={20} aria-hidden /><span><strong>{data.attention.milkReview} medição(ões) aguardando revisão</strong><small>Controle individual</small></span></Link>}
          {data.attention.weightReview > 0 && <Link className="attention-item" to="/pesos"><CowHead size={20} aria-hidden /><span><strong>{data.attention.weightReview} peso(s) aguardando revisão</strong><small>Abrir pesagens</small></span></Link>}
          {data.attention.standaloneDocuments > 0 && <Link className="attention-item" to="/documentos"><FileText size={20} aria-hidden /><span><strong>{data.attention.standaloneDocuments} documento(s) sem vínculo</strong><small>Organizar documentos</small></span></Link>}
        </div>}
      </SectionCard>

      <section><h2 className="mb-3 text-xl font-bold">Ações rápidas</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Link className="quick-action quick-action-primary" to="/producao#total-diario"><Milk size={22} aria-hidden /><span><strong>Registrar produção</strong><small>Manhã e tarde</small></span></Link><Link className="quick-action" to="/producao/coletas/nova"><Truck size={22} aria-hidden /><span><strong>Registrar coleta</strong><small>Data e litros</small></span></Link><Link className="quick-action" to="/mastite/nova"><Activity size={22} aria-hidden /><span><strong>Registrar mastite</strong><small>Fato observado</small></span></Link><Link className="quick-action" to="/compras/nova"><WalletCards size={22} aria-hidden /><span><strong>Registrar saída</strong><small>Compra, conta ou despesa</small></span></Link></div><details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"><summary className="min-h-11 cursor-pointer py-2 font-bold">Mais ações</summary><div className="mt-2 flex flex-wrap gap-2"><Link className="button button-secondary" to="/receitas/nova"><Plus size={17} aria-hidden />Registrar entrada</Link><Link className="button button-secondary" to="/documentos">Enviar documento</Link><Link className="button button-secondary" to="/producao/importar">Controle individual</Link><Link className="button button-secondary" to="/configuracoes/dados">Exportar dados</Link></div></details></section>

      <section><h2 className="mb-3 text-xl font-bold">Resumo de hoje</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label={data.today.production?.basis === 'GROUP_SUM' ? 'Produção por lote' : 'Produção agregada'} value={data.today.milk.productionLiters === null ? 'Não registrada' : formatLiters(data.today.milk.productionLiters)} detail={data.today.production?.basis === 'GROUP_SUM' ? `Soma de ${data.today.production.groupCount} lote(s) registrado(s)` : data.today.production ? 'Rebanho todo' : undefined} /><StatCard label="Coleta" value={data.today.collectionCount ? formatLiters(data.today.milk.collectedLiters) : 'Não registrada'} detail={data.today.collectionCount ? `${data.today.collectionCount} coleta(s)` : undefined} /><StatCard label="Diferença observada" value={data.today.milk.differenceLiters === null ? '—' : formatLiters(data.today.milk.differenceLiters)} detail="Não classificada como perda" /><StatCard label="Animais em tratamento" value={data.today.activeTreatmentCount} /><StatCard label="Casos de mastite abertos" value={data.today.activeCaseCount} /></div>{data.today.milk.differenceLiters !== null && <p className="mt-2 text-xs text-[var(--muted)]">A diferença pode envolver leite no tanque, descarte, consumo, bezerros, horários ou períodos diferentes.</p>}</section>

      {data.today.withdrawals.length > 0 && <SectionCard title="Carência informada">{data.today.withdrawals.map((item) => <Link className="mobile-item" key={item.caseId} to={`/mastite/${item.caseId}`}><span><strong>{item.animalName || `Brinco ${item.tagNumber}`}</strong><span className="block text-xs text-[var(--muted)]">Carência informada até {formatDate(item.withdrawalEndsAt)} · confirme o encerramento</span></span><Badge tone={item.state === 'PAST_DUE' ? 'danger' : 'warning'}>{item.state === 'ENDS_TODAY' ? 'Termina hoje' : item.state === 'PAST_DUE' ? 'Atualização atrasada' : `${item.days} dia(s)`}</Badge></Link>)}</SectionCard>}

      <section><h2 className="mb-3 text-xl font-bold">Visão mensal</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><StatCard label="Produção registrada no mês" value={formatLiters(data.month.productionLiters)} detail={`${data.month.productionDays} dia(s) medido(s)`} /><StatCard label="Leite coletado no mês" value={formatLiters(data.month.collectionLiters)} /><StatCard label="Receitas recebidas" value={formatMoney(data.month.revenuesReceived)} /><StatCard label="Despesas pagas" value={formatMoney(data.month.expensesPaid)} /><StatCard label="Resultado de caixa registrado" value={formatMoney(data.month.cashResult)} detail="Não representa lucro econômico completo" /><StatCard label="Casos de mastite" value={data.month.mastitisCases} /></div><Link className="button button-secondary mt-3" to="/financeiro"><Banknote size={17} aria-hidden />Abrir financeiro</Link></section>

      {data.latestIndividualControl && <SectionCard title="Último controle individual"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{formatDate(data.latestIndividualControl.sessionDate)} · {formatLiters(data.latestIndividualControl.confirmedTotal)}</strong>{data.latestIndividualControl.reviewCount > 0 && <span className="ml-2"><Badge tone="warning">{data.latestIndividualControl.reviewCount} a revisar</Badge></span>}</div><Link className="button button-secondary" to={`/producao/${data.latestIndividualControl.id}`}>Abrir controle</Link></div></SectionCard>}
    </div>
  </div>;
}
