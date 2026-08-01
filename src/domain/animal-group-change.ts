export type DatedGroupAssignment = {
  id: string;
  groupId: string;
  groupName?: string | null;
  startedOn: string;
  endedOn: string | null;
};

export type GroupChangeConflict =
  | 'NO_ASSIGNMENT_ON_DATE'
  | 'OVERLAPPING_HISTORY'
  | 'SAME_DAY_CONFLICT';

export type GroupChangePlan =
  | { kind: 'NO_CHANGE'; assignmentId: string }
  | {
    kind: 'APPLY';
    closeAssignmentId: string;
    closeOn: string;
    insert: {
      groupId: string;
      startedOn: string;
      endedOn: string | null;
    };
  }
  | { kind: 'CONFLICT'; reason: GroupChangeConflict };

function overlaps(left: DatedGroupAssignment, right: DatedGroupAssignment) {
  return left.endedOn === null || left.endedOn > right.startedOn;
}

/**
 * Planeja uma correção histórica sem apagar o que ocorreu depois.
 *
 * Os intervalos são [startedOn, endedOn): o dia de `endedOn` já pertence ao
 * próximo lote. Um vínculo que começa no próprio dia não é substituído
 * silenciosamente, pois não há horário no modelo para ordenar dois fatos.
 */
export function planDatedGroupChange(
  assignments: DatedGroupAssignment[],
  targetGroupId: string,
  changedOn: string,
): GroupChangePlan {
  const ordered = [...assignments].sort((left, right) =>
    left.startedOn.localeCompare(right.startedOn) || left.id.localeCompare(right.id));

  for (let index = 1; index < ordered.length; index += 1) {
    if (overlaps(ordered[index - 1], ordered[index])) {
      return { kind: 'CONFLICT', reason: 'OVERLAPPING_HISTORY' };
    }
  }

  const valid = ordered.filter((assignment) =>
    assignment.startedOn <= changedOn
    && (assignment.endedOn === null || assignment.endedOn > changedOn));
  if (valid.length !== 1) {
    return {
      kind: 'CONFLICT',
      reason: valid.length ? 'OVERLAPPING_HISTORY' : 'NO_ASSIGNMENT_ON_DATE',
    };
  }

  const current = valid[0];
  if (current.groupId === targetGroupId) {
    return { kind: 'NO_CHANGE', assignmentId: current.id };
  }
  if (current.startedOn === changedOn) {
    return { kind: 'CONFLICT', reason: 'SAME_DAY_CONFLICT' };
  }

  return {
    kind: 'APPLY',
    closeAssignmentId: current.id,
    closeOn: changedOn,
    insert: {
      groupId: targetGroupId,
      startedOn: changedOn,
      endedOn: current.endedOn,
    },
  };
}

/**
 * Inferência para revisão: apenas identidade exata pode originar proposta.
 * Sugestões contextuais/fuzzy continuam úteis para a revisão do vínculo, mas
 * nunca ganham o efeito colateral de mover o animal.
 */
export function planInferredGroupChange(
  matchKind: 'EXACT' | 'CONTEXTUAL_TAG' | 'FUZZY' | null,
  assignments: DatedGroupAssignment[],
  targetGroupId: string | null,
  changedOn: string,
) {
  if (matchKind !== 'EXACT' || !targetGroupId) return null;
  const plan = planDatedGroupChange(assignments, targetGroupId, changedOn);
  return plan.kind === 'APPLY' ? plan : null;
}

export function milkTargetGroupIssue(group: {
  active: boolean;
  milkingRoutine: 'MORNING_AND_AFTERNOON' | 'MORNING_ONLY' | 'NOT_MILKED';
} | null | undefined) {
  if (!group) return 'GROUP_NOT_FOUND' as const;
  if (!group.active) return 'GROUP_INACTIVE' as const;
  if (group.milkingRoutine === 'NOT_MILKED') return 'GROUP_NOT_MILKED' as const;
  return null;
}
