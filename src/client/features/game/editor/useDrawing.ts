import { useCallback, useState } from 'react';
import type { MapPoint } from '../../../../domain/game/state';

export type DrawingMode = 'idle' | 'perimeter' | 'pasture' | 'installation';

/**
 * Estado do traçado no editor: modo atual + vértices do rascunho. A validação
 * de anel (mínimo de pontos) fica no domínio; aqui é só a mecânica de
 * adicionar/desfazer/cancelar, independente de Leaflet (testável).
 */
export function useDrawing() {
  const [mode, setMode] = useState<DrawingMode>('idle');
  const [draft, setDraft] = useState<MapPoint[]>([]);

  const start = useCallback((nextMode: Exclude<DrawingMode, 'idle'>) => {
    setMode(nextMode);
    setDraft([]);
  }, []);

  const addVertex = useCallback((point: MapPoint) => {
    setDraft((current) => [...current, point]);
  }, []);

  const undoVertex = useCallback(() => {
    setDraft((current) => current.slice(0, -1));
  }, []);

  const cancel = useCallback(() => {
    setMode('idle');
    setDraft([]);
  }, []);

  return { mode, draft, start, addVertex, undoVertex, cancel };
}
