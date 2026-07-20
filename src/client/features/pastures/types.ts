/** Resumo de um pasto real (GET /api/pastures). */
export type PastureSummary = {
  id: string;
  name: string;
  areaHa: string | null;
  active: boolean;
  /** Ocupação aberta do pasto; null = pasto livre. */
  currentOccupancy: {
    occupancyId: string;
    herdGroupId: string;
    herdGroupName: string;
    startedOn: string;
    occupiedDays: number;
  } | null;
  /** Pasto livre: dias desde a última ocupação encerrada; null = nunca ocupado. */
  restDays: number | null;
};

/** Linha do histórico de rotação (GET /api/pastures/:id/occupancies), mais recente primeiro. */
export type PastureOccupancyRecord = {
  id: string;
  herdGroupId: string;
  herdGroupName: string;
  startedOn: string;
  endedOn: string | null;
  notes: string | null;
};
