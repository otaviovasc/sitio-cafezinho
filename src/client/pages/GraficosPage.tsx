import { Activity, Banknote, ChartLine, Download, FileText, Milk, Scale, ShoppingCart, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CowHead } from '../components/icons';
import { PageHeader } from '../components/ui';

const chartLinks = [
  { to: '/producao', label: 'Produção mês a mês', description: 'Evolução dos totais e controles de leite', icon: Milk },
  { to: '/pesos', label: 'Evolução de peso', description: 'Sessões de pesagem e ganho do rebanho', icon: Scale },
  { to: '/financeiro', label: 'Financeiro mensal', description: 'Entradas, saídas e caixa registrado', icon: Banknote },
] as const;

const recordLinks = [
  { to: '/producao', label: 'Controles e coletas', description: 'Auditoria das sessões de leite', icon: Milk },
  { to: '/pesos', label: 'Sessões de peso', description: 'Auditoria das pesagens', icon: Scale },
  { to: '/compras', label: 'Compras', description: 'Abertas, pagas e vencidas', icon: ShoppingCart },
  { to: '/financeiro', label: 'Receitas', description: 'Recebidas, esperadas e canceladas', icon: Banknote },
  { to: '/mastite', label: 'Casos de mastite', description: 'Ações, tratamento e carência', icon: Activity },
  { to: '/rebanho', label: 'Rebanho', description: 'Animais, lotes e históricos', icon: CowHead },
  { to: '/fornecedores', label: 'Fornecedores', description: 'Cadastro e compras vinculadas', icon: Store },
  { to: '/documentos', label: 'Documentos', description: 'Anexos e arquivos avulsos', icon: FileText },
  { to: '/configuracoes/dados', label: 'Exportação CSV', description: 'Baixar planilhas dos dados', icon: Download },
] as const;

/**
 * Hub fora do jogo: os únicos motivos para sair do tabuleiro — gráficos e as
 * listas de auditoria/correção. Todo registro e consulta do dia a dia acontece
 * no jogo (mapa, folhas e Caderno).
 */
export function GraficosPage() {
  return <div className="page" data-testid="graficos-hub">
    <PageHeader icon={ChartLine} title="Gráficos e registros" subtitle="Consulta e auditoria fora do tabuleiro — o dia a dia fica no jogo" />
    <div className="grid gap-5">
      <section aria-labelledby="charts-title">
        <h2 id="charts-title" className="mb-3 text-xl font-bold">Gráficos</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {chartLinks.map((link) => <Link className="quick-action" key={link.label} to={link.to}><link.icon size={22} aria-hidden /><span><strong>{link.label}</strong><small>{link.description}</small></span></Link>)}
        </div>
      </section>
      <section aria-labelledby="records-title">
        <h2 id="records-title" className="mb-3 text-xl font-bold">Registros e auditoria</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {recordLinks.map((link) => <Link className="quick-action" key={link.label} to={link.to}><link.icon size={22} aria-hidden /><span><strong>{link.label}</strong><small>{link.description}</small></span></Link>)}
        </div>
      </section>
    </div>
  </div>;
}
