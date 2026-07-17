import type { ProposedActionType } from '../../domain/nl/resolve.js';
import { fail } from '../http/api-error.js';
import { createDailyMilkTotal } from './daily-milk.service.js';

/**
 * Costura extensível entre uma ação proposta e o endpoint validado que já
 * existe. Acrescentar um tipo de ação = acrescentar uma entrada aqui. As ações
 * de múltiplas linhas (controle individual, pesagem) não entram aqui: elas
 * reaproveitam a revisão de importação, que faz o casamento por animal.
 */

export type CommitResult = { recordType: string; recordId: string };
type Committer = (payload: Record<string, unknown>) => Promise<CommitResult>;

const committers: Partial<Record<ProposedActionType, Committer>> = {
  DAILY_MILK_TOTAL: async (payload) => {
    const morning = payload.morningLiters;
    const afternoon = payload.afternoonLiters;
    const created = await createDailyMilkTotal({
      productionDate: String(payload.productionDate),
      herdGroupId: (payload.herdGroupId as string | null | undefined) ?? null,
      morningLiters: morning === null || morning === undefined ? null : Number(morning),
      afternoonLiters: afternoon === null || afternoon === undefined ? null : Number(afternoon),
      notes: (payload.notes as string | null | undefined) ?? null,
    });
    return { recordType: 'daily_milk_total', recordId: created.id };
  },
};

export function canCommitDirectly(actionType: ProposedActionType): boolean {
  return actionType in committers;
}

export async function commitProposedAction(
  actionType: ProposedActionType,
  payload: Record<string, unknown>,
): Promise<CommitResult> {
  const committer = committers[actionType];
  if (!committer) return fail('Esta ação é revisada e salva na tela específica, não diretamente por aqui.', 400, 'REQUIRES_REVIEW_HANDOFF');
  return committer(payload);
}
