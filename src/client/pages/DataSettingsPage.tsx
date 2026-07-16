import { Database, Download } from 'lucide-react';
import { PageHeader, SectionCard } from '../components/ui';

const exports = [
  { dataset: 'animals', filename: 'sitio-animais-aliases-ciclos.csv', title: 'Exportar animais', description: 'Animais, aliases e histórico do ciclo produtivo' },
  { dataset: 'production', filename: 'sitio-producao.csv', title: 'Exportar produção', description: 'Produção agregada, sessões e medições individuais originais' },
  { dataset: 'collections', filename: 'sitio-coletas.csv', title: 'Exportar coletas', description: 'Volumes retirados pelo laticínio' },
  { dataset: 'weights', filename: 'sitio-pesos.csv', title: 'Exportar peso', description: 'Sessões, rótulos originais, revisão e medições' },
  { dataset: 'mastitis', filename: 'sitio-mastite.csv', title: 'Exportar mastite', description: 'Casos, tratamentos informados, carências e ações' },
  { dataset: 'finance', filename: 'sitio-compras-receitas-fornecedores.csv', title: 'Exportar compras e receitas', description: 'Compras, receitas e fornecedores' },
];

export function DataSettingsPage() {
  return <div className="page"><PageHeader icon={Database} title="Dados" subtitle="Cópias CSV dos fatos registrados no PostgreSQL" /><div className="grid gap-4 sm:grid-cols-2">{exports.map((item) => <SectionCard key={item.dataset}><div className="flex h-full flex-col items-start"><h2 className="text-lg font-bold">{item.title}</h2><p className="mb-4 mt-1 flex-1 text-sm text-[var(--muted)]">{item.description}</p><a className="button button-secondary" href={`/api/data-exports/${item.dataset}.csv`} download={item.filename}><Download size={17} aria-hidden />Baixar CSV</a></div></SectionCard>)}</div><div className="notice notice-info mt-5">Os CSVs preservam rótulos, textos originais, estados de revisão e datas. Backup completo e restauração do PostgreSQL são feitos pelos comandos documentados, não por esta tela.</div></div>;
}
