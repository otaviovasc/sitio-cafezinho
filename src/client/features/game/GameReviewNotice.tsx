import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { dismissReviewAction, type ReviewableAction, type ReviewOutcome } from './review';

/**
 * Aviso do modo revisão no topo da folha: selo "Vindo do assistente", os
 * problemas que a interpretação marcou e o Descartar (dismiss da ação — a
 * captura sai da fila sem virar fato).
 */
export function GameReviewNotice({ action, onDone }: { action: ReviewableAction; onDone: (outcome: ReviewOutcome) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const issues = action.issues ?? [];

  async function dismiss() {
    setBusy(true);
    setError('');
    try {
      await dismissReviewAction(action);
      onDone('dismissed');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível descartar.');
      setBusy(false);
    }
  }

  return <div className="notice notice-warning mb-3" data-testid="game-sheet-review-badge">
    <div className="flex items-center gap-2"><Sparkles size={16} aria-hidden /><strong>Vindo do assistente</strong></div>
    <p className="mt-1 text-xs">Confira os valores preenchidos e confirme — ou corrija o que for preciso antes.</p>
    {issues.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    <button type="button" className="game-sheet-back mt-2" data-testid="game-sheet-review-dismiss" disabled={busy} onClick={() => void dismiss()}>
      {busy ? 'Descartando…' : 'Descartar esta captura'}
    </button>
  </div>;
}
