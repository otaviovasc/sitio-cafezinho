import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { formatDate } from '../../../../domain/format';
import { Badge, InlineEmpty, ScrollArea, SectionCard } from '../../../components/ui';
import { mastitisStatusDescriptor } from '../../../lib/status';
import type { AnimalDetail } from '../../../pages/AnimalsPage';

export function AnimalMastitisSection({ data, animalId }: { data: AnimalDetail; animalId: string }) {
  const openMastitisCases = data.mastitisCases.filter((item) => !['RESOLVED', 'CANCELLED'].includes(item.status));
  return <SectionCard title="Mastite" icon={Activity} className="lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted)]">{openMastitisCases.length ? `${openMastitisCases.length} caso(s) atual(is)` : 'Nenhum caso atual'}</p><Link className="button button-secondary" to={`/mastite/nova?animalId=${animalId}`}>Registrar mastite</Link></div>{!data.mastitisCases.length ? <InlineEmpty className="mt-3">Nenhum caso registrado para este animal.</InlineEmpty> : <ScrollArea label="Histórico de mastite" className="mt-3 max-h-72">{data.mastitisCases.map((item) => { const nextAction = item.actions.find((action) => !action.completedAt && !action.cancelledAt); return <Link className="mobile-item items-start" key={item.id} to={`/mastite/${item.id}`}><span><strong>{mastitisStatusDescriptor[item.status].label}</strong><span className="block text-xs text-[var(--muted)]">Detectado em {new Date(item.detectedAt).toLocaleDateString('pt-BR')}</span>{item.withdrawalEndsAt && <span className="block text-xs font-semibold text-[var(--warning)]">Carência informada até {formatDate(item.withdrawalEndsAt)}</span>}{nextAction && <span className="block text-xs text-[var(--muted)]">Próxima ação: {nextAction.actionDescription}</span>}</span>{item.milkDiscardRequired && <Badge tone="danger">Descarte informado</Badge>}</Link>; })}</ScrollArea>}</SectionCard>;
}
