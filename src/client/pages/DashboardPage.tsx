import { Activity, AlertTriangle, BadgeDollarSign, Banknote, CalendarClock, CheckCircle2, Download, FileText, Home, Milk, Scale, Search, ShoppingCart, Store, Truck, Upload, WalletCards, Wheat } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatLiters, formatMoney } from '../../domain/format';
import { CowHead } from '../components/icons';
import { CaptureCard } from '../components/capture';
import { Badge, ErrorState, LoadingState, PageHeader, SectionCard, StatCard } from '../components/ui';
import { useResource } from '../hooks/useResource';

type Dashboard = {
  date: string;
  today: {
    production: null | { productionDate: string; totalLiters: number; basis: 'HERD_TOTAL' | 'GROUP_SUM'; groupCount: number };
    collectionCount: number;
    feedingCount: number;
    milk: { productionLiters: number | null; collectedLiters: number; differenceLiters: number | null };
    activeTreatmentCount: number;
    activeCaseCount: number;
    actionsToday: number;
    overdueActions: number;
    withdrawals: Array<{ caseId: string; animalId: string; animalName: string | null; tagNumber: string | null; withdrawalEndsAt: string; days: number; state: string }>;
  };
  attention: { productionMissing: boolean; productionGroupsMissing: number; collectionMissing: boolean; feedingMissing: boolean; mastitisActionsToday: number; overdueMastitisActions: number; withdrawals: number; purchasesDueTomorrow: number; overduePurchases: number; overdueTotal: number; milkReview: number; weightReview: number; standaloneDocuments: number; lactatingWithoutGroup: number };
  month: { productionLiters: number; productionDays: number; collectionLiters: number; milkPricePerLiter: number | null; estimatedMilkValue: number | null; revenuesReceived: number; revenuesExpected: number; expensesPaid: number; purchasesOpen: number; cashResult: number; mastitisCases: number };
  herd: { total: number; lactating: number; dry: number; heifers: number; groups: Array<{ id: string; name: string; milkingRoutine: string; animalCount: number }> };
  latestIndividualControl: null | { id: string; sessionDate: string; confirmedTotal: number; reviewCount: number };
  documents: { errors: number; storageMode: string };
};

const quickActionGroups = [
  {
    title: 'Registrar e atualizar',
    description: 'Lançamentos que alimentam o acompanhamento do sítio.',
    actions: [
      { to: '/producao/individual/novo', label: 'Controle individual', description: 'Medições de cada animal', icon: Upload },
      { to: '/pesos/novo', label: 'Registrar pesos', description: 'Pesagem, mesmo parcial', icon: Scale },
      { to: '/mastite/nova', label: 'Registrar mastite', description: 'Fato observado e decisão', icon: Activity },
      { to: '/rebanho/novo', label: 'Cadastrar animal', description: 'Um animal ou uma lista', icon: CowHead },
      { to: '/receitas/nova', label: 'Registrar entrada', description: 'Receita recebida ou esperada', icon: Banknote },
      { to: '/compras/nova', label: 'Registrar saída', description: 'Compra, conta ou despesa', icon: WalletCards },
      { to: '/documentos', label: 'Enviar documento', description: 'Arquivo avulso ou consulta', icon: FileText },
    ],
  },
  {
    title: 'Consultar e organizar',
    description: 'Históricos, pendências e configurações que já existem no app.',
    actions: [
      { to: '/rebanho', label: 'Consultar animal', description: 'Nome, brinco, lote e situação', icon: Search, primary: true },
      { to: '/producao', label: 'Produção e coletas', description: 'Totais, controles e histórico', icon: Milk },
      { to: '/pesos', label: 'Histórico de pesos', description: 'Sessões e evolução', icon: Scale },
      { to: '/mastite', label: 'Casos de mastite', description: 'Ações, tratamento e carência', icon: Activity },
      { to: '/financeiro', label: 'Abrir financeiro', description: 'Entradas, saídas e caixa', icon: Banknote },
      { to: '/compras', label: 'Contas e compras', description: 'Abertas, pagas e vencidas', icon: ShoppingCart },
      { to: '/fornecedores', label: 'Fornecedores', description: 'Cadastro e compras vinculadas', icon: Store },
      { to: '/financeiro/preco-leite', label: 'Preço do leite', description: 'Preço mensal e estimativa', icon: BadgeDollarSign },
      { to: '/configuracoes/dados', label: 'Exportar dados', description: 'Baixar planilhas em CSV', icon: Download },
    ],
  },
] as const;

export function DashboardPage() {
  const { data, loading, error, reload } = useResource<Dashboard>('/api/dashboard');
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Painel indisponível.'} retry={reload} /></div>;
  const productionComplete = Boolean(data.today.production) && data.attention.productionGroupsMissing === 0;
  const followUpCount = data.attention.mastitisActionsToday + data.attention.overdueMastitisActions + data.attention.withdrawals + data.attention.purchasesDueTomorrow + data.attention.overduePurchases + data.attention.milkReview + data.attention.weightReview + data.attention.standaloneDocuments + data.attention.lactatingWithoutGroup;
  return <div className="page"><PageHeader icon={Home} title="Hoje" subtitle={`${formatDate(data.date)} · o que precisa ser registrado ou resolvido`} />
    <div className="grid gap-5">
      <CaptureCard />
      <SectionCard icon={CalendarClock} title="Fechamento do dia">
        <p className="mb-4 text-sm text-[var(--muted)]">Registre os fatos medidos durante o dia. Um não substitui o outro.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link className={`daily-task ${productionComplete ? 'daily-task-complete' : 'daily-task-pending'}`} to="/producao/total/novo">
            <span className="daily-task-icon">{productionComplete ? <CheckCircle2 size={22} aria-hidden /> : <Milk size={22} aria-hidden />}</span>
            <span className="min-w-0 flex-1"><strong>Produção do dia</strong><small>{data.attention.productionMissing ? 'Registrar rebanho todo ou por lote' : data.attention.productionGroupsMissing > 0 ? `${data.attention.productionGroupsMissing} lote(s) ainda sem registro` : `${formatLiters(data.today.milk.productionLiters ?? 0)} registrado`}</small></span>
            <Badge tone={productionComplete ? 'success' : 'warning'}>{productionComplete ? 'Feito' : 'Pendente'}</Badge>
          </Link>
          <Link className={`daily-task ${data.attention.collectionMissing ? 'daily-task-pending' : 'daily-task-complete'}`} to="/producao/coletas/nova">
            <span className="daily-task-icon">{data.attention.collectionMissing ? <Truck size={22} aria-hidden /> : <CheckCircle2 size={22} aria-hidden />}</span>
            <span className="min-w-0 flex-1"><strong>Coleta do leiteiro</strong><small>{data.attention.collectionMissing ? 'Registrar o volume retirado' : `${formatLiters(data.today.milk.collectedLiters)} em ${data.today.collectionCount} coleta(s)`}</small></span>
            <Badge tone={data.attention.collectionMissing ? 'warning' : 'success'}>{data.attention.collectionMissing ? 'Pendente' : 'Feito'}</Badge>
          </Link>
          <Link className={`daily-task ${data.attention.feedingMissing ? 'daily-task-pending' : 'daily-task-complete'}`} to="/alimentacao/trato/novo" data-testid="daily-task-feeding">
            <span className="daily-task-icon">{data.attention.feedingMissing ? <Wheat size={22} aria-hidden /> : <CheckCircle2 size={22} aria-hidden />}</span>
            <span className="min-w-0 flex-1"><strong>Trato do dia</strong><small>{data.attention.feedingMissing ? 'Registrar a alimentação dada hoje' : `${data.today.feedingCount} trato(s) registrado(s)`}</small></span>
            <Badge tone={data.attention.feedingMissing ? 'warning' : 'success'}>{data.attention.feedingMissing ? 'Pendente' : 'Feito'}</Badge>
          </Link>
        </div>
      </SectionCard>

      <section aria-labelledby="quick-actions-title">
        <div className="mb-3"><h2 id="quick-actions-title" className="text-xl font-bold">Ações rápidas</h2><p className="mt-1 text-sm text-[var(--muted)]">Produção diária e coleta ficam no fechamento acima; os demais caminhos estão todos aqui.</p></div>
        <div className="grid gap-5 lg:grid-cols-2">
          {quickActionGroups.map((group) => <div key={group.title}>
            <h3 className="text-sm font-bold">{group.title}</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{group.description}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {group.actions.map((action) => {
                const Icon = action.icon;
                return <Link className={`quick-action ${'primary' in action && action.primary ? 'quick-action-primary' : ''}`} key={action.to} to={action.to}><Icon size={22} aria-hidden /><span><strong>{action.label}</strong><small>{action.description}</small></span></Link>;
              })}
            </div>
          </div>)}
        </div>
      </section>

      <SectionCard icon={followUpCount ? AlertTriangle : CheckCircle2} title={followUpCount ? `Para hoje e amanhã · ${followUpCount}` : 'Tudo em ordem para hoje e amanhã'}>
        {!followUpCount ? <div className="notice notice-info">Nenhuma ação registrada precisa de atenção agora.</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.attention.mastitisActionsToday > 0 && <Link className="attention-item" to="/mastite"><Activity size={20} aria-hidden /><span><strong>{data.attention.mastitisActionsToday} ação(ões) de mastite para hoje</strong><small>Abrir casos</small></span></Link>}
          {data.attention.overdueMastitisActions > 0 && <Link className="attention-item attention-danger" to="/mastite"><Activity size={20} aria-hidden /><span><strong>{data.attention.overdueMastitisActions} ação(ões) atrasada(s)</strong><small>Atualizar ações</small></span></Link>}
          {data.attention.withdrawals > 0 && <Link className="attention-item" to="/mastite"><Activity size={20} aria-hidden /><span><strong>{data.attention.withdrawals} vaca(s) com carência informada</strong><small>Confirmar antes de liberar o leite</small></span></Link>}
          {data.attention.purchasesDueTomorrow > 0 && <Link className="attention-item" to="/compras"><CalendarClock size={20} aria-hidden /><span><strong>{data.attention.purchasesDueTomorrow} conta(s) vence(m) amanhã</strong><small>Abrir compras</small></span></Link>}
          {data.attention.overduePurchases > 0 && <Link className="attention-item attention-danger" to="/compras"><CalendarClock size={20} aria-hidden /><span><strong>{data.attention.overduePurchases} conta(s) vencida(s)</strong><small>{formatMoney(data.attention.overdueTotal)}</small></span></Link>}
          {data.attention.milkReview > 0 && <Link className="attention-item" to="/producao"><Milk size={20} aria-hidden /><span><strong>{data.attention.milkReview} medição(ões) aguardando revisão</strong><small>Controle individual</small></span></Link>}
          {data.attention.weightReview > 0 && <Link className="attention-item" to="/pesos"><CowHead size={20} aria-hidden /><span><strong>{data.attention.weightReview} peso(s) aguardando revisão</strong><small>Abrir pesagens</small></span></Link>}
          {data.attention.standaloneDocuments > 0 && <Link className="attention-item" to="/documentos"><FileText size={20} aria-hidden /><span><strong>{data.attention.standaloneDocuments} documento(s) sem vínculo</strong><small>Organizar documentos</small></span></Link>}
          {data.attention.lactatingWithoutGroup > 0 && <Link className="attention-item" to="/rebanho"><CowHead size={20} aria-hidden /><span><strong>{data.attention.lactatingWithoutGroup} animal(is) em lactação sem lote</strong><small>Revisar rotina de ordenha</small></span></Link>}
        </div>}
      </SectionCard>

      <section><h2 className="mb-3 text-xl font-bold">Resumo de hoje</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label={data.today.production?.basis === 'GROUP_SUM' ? 'Produção por lote' : 'Produção agregada'} value={data.today.milk.productionLiters === null ? 'Não registrada' : formatLiters(data.today.milk.productionLiters)} detail={data.today.production?.basis === 'GROUP_SUM' ? `Soma de ${data.today.production.groupCount} lote(s) registrado(s)` : data.today.production ? 'Rebanho todo' : undefined} /><StatCard label="Coleta" value={data.today.collectionCount ? formatLiters(data.today.milk.collectedLiters) : 'Não registrada'} detail={data.today.collectionCount ? `${data.today.collectionCount} coleta(s)` : undefined} /><StatCard label="Diferença observada" value={data.today.milk.differenceLiters === null ? '—' : formatLiters(data.today.milk.differenceLiters)} detail="Não classificada como perda" /><StatCard label="Animais em tratamento" value={data.today.activeTreatmentCount} /><StatCard label="Casos de mastite abertos" value={data.today.activeCaseCount} /></div>{data.today.milk.differenceLiters !== null && <p className="mt-2 text-xs text-[var(--muted)]">A diferença pode envolver leite no tanque, descarte, consumo, bezerros, horários ou períodos diferentes.</p>}</section>

      {data.today.withdrawals.length > 0 && <SectionCard title={`Carência informada · ${data.today.withdrawals.length}`} action={<Link className="button button-secondary" to="/mastite">Ver todos</Link>}>
        {data.today.withdrawals.slice(0, 5).map((item) => <Link className="mobile-item" key={item.caseId} to={`/mastite/${item.caseId}`}><span><strong>{item.animalName || `Brinco ${item.tagNumber}`}</strong><span className="block text-xs text-[var(--muted)]">Carência informada até {formatDate(item.withdrawalEndsAt)} · confirme o encerramento</span></span><Badge tone={item.state === 'PAST_DUE' ? 'danger' : 'warning'}>{item.state === 'ENDS_TODAY' ? 'Termina hoje' : item.state === 'PAST_DUE' ? 'Atualização atrasada' : `${item.days} dia(s)`}</Badge></Link>)}
        {data.today.withdrawals.length > 5 && <p className="mt-3 text-xs text-[var(--muted)]">Mais {data.today.withdrawals.length - 5} caso(s) com carência informada estão na tela de mastite.</p>}
      </SectionCard>}

      <section><h2 className="mb-3 text-xl font-bold">Visão mensal</h2><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Produção registrada no mês" value={formatLiters(data.month.productionLiters)} detail={`${data.month.productionDays} dia(s) medido(s)`} /><StatCard label="Leite coletado no mês" value={formatLiters(data.month.collectionLiters)} /><StatCard label="Preço do leite" value={data.month.milkPricePerLiter === null ? 'Não informado' : `${formatMoney(data.month.milkPricePerLiter)}/L`} detail="Valor mensal editável" /><StatCard label="Estimativa das coletas" value={data.month.estimatedMilkValue === null ? '—' : formatMoney(data.month.estimatedMilkValue)} detail="Não é receita recebida" /><StatCard label="Receitas recebidas" value={formatMoney(data.month.revenuesReceived)} /><StatCard label="Despesas pagas" value={formatMoney(data.month.expensesPaid)} /><StatCard label="Resultado de caixa registrado" value={formatMoney(data.month.cashResult)} detail="Não representa lucro econômico completo" /><StatCard label="Casos de mastite" value={data.month.mastitisCases} /></div><div className="mt-3 flex flex-wrap gap-2"><Link className="button button-secondary" to="/financeiro"><Banknote size={17} aria-hidden />Abrir financeiro</Link><Link className="button button-secondary" to="/financeiro/preco-leite">Ajustar preço do leite</Link></div></section>

      {data.latestIndividualControl && <SectionCard title="Último controle individual"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{formatDate(data.latestIndividualControl.sessionDate)} · {formatLiters(data.latestIndividualControl.confirmedTotal)}</strong>{data.latestIndividualControl.reviewCount > 0 && <span className="ml-2"><Badge tone="warning">{data.latestIndividualControl.reviewCount} a revisar</Badge></span>}</div><Link className="button button-secondary" to={`/producao/${data.latestIndividualControl.id}`}>Abrir controle</Link></div></SectionCard>}
    </div>
  </div>;
}
