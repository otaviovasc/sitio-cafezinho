// Registro central de rótulo+tom por enum. A camada de revisão (Revisar,
// ReviewCard) consome daqui em vez de repetir ternários por página. As demais
// telas migram para cá aos poucos (trilha de refino de UI).

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
