import { useEffect, useSyncExternalStore } from 'react';
import { gameAudio, type GameSoundKey } from './audio';

/**
 * Liga o áudio do jogo enquanto a página estiver montada (unlock no primeiro
 * gesto, trilha ambiente, pausa fora da aba) e expõe mudo + efeitos.
 */
export function useGameAudio() {
  useEffect(() => {
    gameAudio.init();
    return () => { gameAudio.dispose(); };
  }, []);
  const muted = useSyncExternalStore(gameAudio.subscribe, gameAudio.isMuted);
  return {
    muted,
    toggleMuted: () => { gameAudio.toggleMuted(); },
    play: (key: GameSoundKey) => { gameAudio.play(key); },
  };
}
