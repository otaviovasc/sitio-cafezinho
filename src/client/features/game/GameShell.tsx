import '@fontsource-variable/nunito';
import type { ReactNode } from 'react';

/**
 * Moldura full-bleed do jogo: ocupa a viewport abaixo do cabeçalho (e acima da
 * navegação inferior no celular). Tudo dentro dela vive no mundo do jogo —
 * fundo "mesa", fonte Nunito e HUD flutuante; nada de .page/.section-card.
 */
export function GameShell({ children }: { children: ReactNode }) {
  return <div className="game-root" data-testid="game-root">{children}</div>;
}
