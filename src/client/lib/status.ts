// Registro central de rótulo+tom por enum. A camada de revisão (Revisar,
// ReviewCard) consome daqui em vez de repetir ternários por página. As demais
// telas migram para cá aos poucos (trilha de refino de UI).

import { statusTone as animalStatusTone, type AnimalStatus } from '../../domain/animal-lifecycle';
import { animalStatusLabels } from './labels';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';
export type StatusDescriptor = { label: string; tone: BadgeTone };

export const proposedActionTypeLabel: Record<string, string> = {
  DAILY_MILK_TOTAL: 'Produção diária',
  INDIVIDUAL_MILK_SESSION: 'Controle individual',
  MILK_COLLECTION: 'Coleta',
  MASTITIS_CASE: 'Mastite',
  PURCHASE: 'Compra',
  REVENUE: 'Receita',
  WEIGHT_SESSION: 'Pesagem',
  FEED_PURCHASE: 'Compra de alimento',
  FEEDING_EVENT: 'Trato',
  UNKNOWN: 'Não reconhecido',
};

export const proposedActionStatusDescriptor: Record<string, StatusDescriptor> = {
  NEEDS_REVIEW: { label: 'A confirmar', tone: 'warning' },
  CONFIRMED: { label: 'Confirmado', tone: 'success' },
  DISMISSED: { label: 'Descartado', tone: 'neutral' },
  FAILED: { label: 'Falhou', tone: 'danger' },
};

export const commitStatusDescriptor: Record<string, StatusDescriptor> = {
  READY: { label: 'Pronto para salvar', tone: 'success' },
  NEEDS_REVIEW: { label: 'Precisa de revisão', tone: 'warning' },
  NEEDS_PERIOD: { label: 'Falta um período', tone: 'warning' },
  UNREPRESENTABLE: { label: 'Não salvável ainda', tone: 'danger' },
};

export const captureInputKindLabel: Record<string, string> = {
  AUDIO: 'Áudio',
  DOCUMENT: 'Documento',
  TEXT: 'Texto',
};

// Situação de uma medição de leite (masculino: "Confirmado"/"Excluído").
export const milkMeasurementStatusDescriptor: Record<string, StatusDescriptor> = {
  CONFIRMED: { label: 'Confirmado', tone: 'success' },
  NEEDS_REVIEW: { label: 'Aguardando revisão', tone: 'warning' },
  EXCLUDED: { label: 'Excluído', tone: 'neutral' },
};

// Situação de uma pesagem (feminino: "Confirmada"/"Excluída", revisão curta).
export const weightMeasurementStatusDescriptor: Record<string, StatusDescriptor> = {
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  NEEDS_REVIEW: { label: 'Revisar', tone: 'warning' },
  EXCLUDED: { label: 'Excluída', tone: 'neutral' },
};

export const confidenceLabel: Record<string, string> = {
  HIGH: 'Confiança alta',
  MEDIUM: 'Confiança média',
  LOW: 'Baixa confiança · confira antes de selecionar',
};

// Mastite: situação do caso, teto, método, resultado e prazo da ação.
export const mastitisStatusDescriptor: Record<string, StatusDescriptor> = {
  OBSERVATION: { label: 'Em observação', tone: 'warning' },
  IN_TREATMENT: { label: 'Em tratamento', tone: 'warning' },
  WITHDRAWAL_PERIOD: { label: 'Em carência', tone: 'warning' },
  RESOLVED: { label: 'Resolvido', tone: 'success' },
  RECURRENT: { label: 'Recorrente', tone: 'danger' },
  NO_IMPROVEMENT: { label: 'Sem melhora', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

export const mastitisQuarterLabel: Record<string, string> = {
  FRONT_LEFT: 'Dianteiro esquerdo', FRONT_RIGHT: 'Dianteiro direito', REAR_LEFT: 'Traseiro esquerdo', REAR_RIGHT: 'Traseiro direito', MULTIPLE: 'Mais de um teto', UNKNOWN: 'Não identificado',
};

export const mastitisDetectionLabel: Record<string, string> = {
  VISUAL: 'Observação visual', BLACK_PLATE: 'Caneca de fundo preto', CMT: 'CMT', VETERINARY: 'Avaliação veterinária', OTHER: 'Outro', UNKNOWN: 'Não identificado',
};

export const mastitisOutcomeLabel: Record<string, string> = {
  RESOLVED: 'Resolvido', IMPROVED: 'Melhorou', RECURRENT: 'Recorrente', NO_IMPROVEMENT: 'Sem melhora', ANIMAL_CULLED: 'Animal descartado', UNKNOWN: 'Não informado',
};

export const mastitisTimingDescriptor: Record<string, StatusDescriptor> = {
  TODAY: { label: 'Hoje', tone: 'warning' },
  OVERDUE: { label: 'Atrasada', tone: 'danger' },
  UPCOMING: { label: 'Programada', tone: 'neutral' },
  COMPLETED: { label: 'Realizada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

export const milkCollectionSourceLabel: Record<string, string> = {
  DRIVER_READING: 'Leitura do caminhoneiro',
  TANK_READING: 'Leitura do tanque',
  RECEIPT: 'Comprovante',
  OTHER: 'Outra origem',
};

export const revenueStatusDescriptor: Record<string, StatusDescriptor> = {
  EXPECTED: { label: 'A receber', tone: 'warning' },
  RECEIVED: { label: 'Recebida', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

// Situação da compra: depende do vencimento (isOverdue), por isso é função.
// A lista usa "Aberta" no estado em aberto; detalhe/financeiro usam "A pagar".
export function purchaseStatusDescriptor(status: string, isOverdue: boolean, openLabel = 'A pagar'): StatusDescriptor {
  if (status === 'PAID') return { label: 'Paga', tone: 'success' };
  if (status === 'CANCELLED') return { label: 'Cancelada', tone: 'neutral' };
  if (isOverdue) return { label: 'Vencida', tone: 'danger' };
  return { label: openLabel, tone: 'warning' };
}

export function animalStatusDescriptor(status: AnimalStatus): StatusDescriptor {
  return { label: animalStatusLabels[status], tone: animalStatusTone(status) };
}
