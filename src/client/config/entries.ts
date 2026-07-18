import { ClipboardList, Milk, Scale, Truck, Wheat, type LucideIcon } from 'lucide-react';

// Fonte única dos tipos de lançamento. O Assistente (modal), a tela Hoje e a
// navegação leem daqui — para acrescentar um tipo de entrada, edite só isto.
export type CaptureMode = 'audio' | 'document' | 'text';

export type EntryType = {
  key: string;
  label: string;
  description: string;
  route: string;
  icon: LucideIcon;
  captureModes: CaptureMode[];
};

export const ENTRY_TYPES: EntryType[] = [
  { key: 'milk_collection', label: 'Coleta', description: 'Volume retirado pelo laticínio', route: '/producao/coletas/nova', icon: Truck, captureModes: ['audio', 'document', 'text'] },
  { key: 'daily_milk_total', label: 'Total do dia', description: 'Produção do rebanho ou de um lote', route: '/producao/total/novo', icon: Milk, captureModes: ['audio', 'text'] },
  { key: 'individual_milk_session', label: 'Individual', description: 'Medição vaca a vaca', route: '/producao/individual/novo', icon: ClipboardList, captureModes: ['audio', 'document', 'text'] },
  { key: 'weight_session', label: 'Peso', description: 'Pesagem do rebanho', route: '/pesos/novo', icon: Scale, captureModes: ['document', 'text'] },
  { key: 'feeding_event', label: 'Trato', description: 'Alimentação dada ao rebanho', route: '/alimentacao/trato/novo', icon: Wheat, captureModes: ['audio', 'text'] },
];
