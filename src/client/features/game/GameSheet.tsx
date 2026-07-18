import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Moldura compartilhada das folhas ambientadas do jogo (.game-sheet): portal,
 * backdrop, focus trap, Esc fecha e retorno de foco — a acessibilidade do
 * Modal padrão com a pele do tabuleiro. Cada instalação monta o próprio
 * conteúdo por cima (GameActionSheet, GameGroupSheet, …).
 */
export function GameSheet({ open, label, testid, sprite, title, subtitle, onClose, children }: {
  open: boolean;
  label: string;
  testid: string;
  /** Sprite do cabeçalho, já dentro de um viewBox 0 0 64 64. */
  sprite: ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    }, 0);
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="game-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="game-sheet" role="dialog" aria-modal="true" aria-label={label} data-testid={testid}>
        <div className="game-sheet-header">
          <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden>{sprite}</svg>
          <div className="min-w-0">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="game-sheet-close" aria-label="Fechar" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
