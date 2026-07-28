import { api, json } from '../../lib/api';
import type { InstallationSheetKey } from './installations.registry';

/**
 * Revisão pós-IA contextual (fase 5) — tipos e helpers (sem componentes,
 * padrão fast-refresh; o aviso visual fica em review.tsx). A revisão acontece
 * na folha do jogo onde o fato vai viver, já preenchida: confirmar é um toque
 * (o formulário real envia o payload revisado para o commit da ação
 * proposta), corrigir é editar o mesmo formulário de sempre. Nada grava fato
 * fora da pipeline de revisão: o destino final é sempre
 * POST /api/captures/:captureId/actions/:actionId/commit (ou
 * /api/import/milk-session para o controle individual, que confirma a ação de
 * origem — ver resolveSourceAction no servidor).
 */

/** Ação proposta carregada para revisão numa folha (GET /api/captures/:id). */
export type ReviewableAction = {
  id: string;
  captureId: string;
  actionType: string;
  resolvedPayload: Record<string, unknown> | null;
  issues: string[] | null;
  commitStatus: string;
  status: string;
};

/** Confirmação em modo revisão: o formulário real chama onCommit no submit. */
export type ReviewSubmit = {
  /** Rótulo do botão de confirmação (ex.: "Confirmar produção"). */
  label: string;
  onCommit: (payload: Record<string, unknown>) => Promise<void>;
};

export type ReviewOutcome = 'committed' | 'dismissed';

export type SheetReview = {
  action: ReviewableAction;
  onDone: (outcome: ReviewOutcome) => void;
};

type ReviewSheetTarget = Extract<InstallationSheetKey, 'mangueira' | 'cocho' | 'deposito' | 'casa' | 'balanca' | 'enfermaria'>;

/**
 * Destino óbvio de uma ação proposta: a folha onde o fato vive. Trato falado
 * "na ordenha" abre na mangueira; os demais contextos abrem no cocho (a folha
 * usa o contexto do payload). Sem destino claro (UNKNOWN) → caderno/Pendências.
 */
export function reviewDestination(action: Pick<ReviewableAction, 'actionType' | 'resolvedPayload'>): ReviewSheetTarget | null {
  switch (action.actionType) {
    case 'DAILY_MILK_TOTAL':
    case 'MILK_COLLECTION':
    case 'INDIVIDUAL_MILK_SESSION':
      return 'mangueira';
    case 'FEEDING_EVENT':
      return action.resolvedPayload?.context === 'MILKING' ? 'mangueira' : 'cocho';
    case 'FEED_PURCHASE':
      return 'deposito';
    case 'PURCHASE':
    case 'REVENUE':
      return 'casa';
    case 'MASTITIS_CASE':
      return 'enfermaria';
    case 'WEIGHT_SESSION':
      return 'balanca';
    default:
      return null;
  }
}

export async function commitReviewAction(action: ReviewableAction, payload: Record<string, unknown>) {
  await api(`/api/captures/${action.captureId}/actions/${action.id}/commit`, json('POST', { payload }));
}

export async function dismissReviewAction(action: ReviewableAction) {
  await api(`/api/captures/${action.captureId}/actions/${action.id}/dismiss`, json('POST'));
}
