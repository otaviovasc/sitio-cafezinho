import { afterEach, describe, expect, it } from 'vitest';
import { gameAudio } from '../../src/client/features/game/audio';

describe('áudio do jogo durante gravações', () => {
  afterEach(() => {
    while (gameAudio.isPausedForRecording()) gameAudio.resumeAfterRecording();
  });

  it('pausa temporariamente sem alterar a preferência de mudo', () => {
    const mutedBefore = gameAudio.isMuted();

    gameAudio.pauseForRecording();

    expect(gameAudio.isPausedForRecording()).toBe(true);
    expect(gameAudio.isMuted()).toBe(mutedBefore);

    gameAudio.resumeAfterRecording();

    expect(gameAudio.isPausedForRecording()).toBe(false);
    expect(gameAudio.isMuted()).toBe(mutedBefore);
  });

  it('só retoma depois que todas as pausas aninhadas terminam', () => {
    gameAudio.pauseForRecording();
    gameAudio.pauseForRecording();
    gameAudio.resumeAfterRecording();
    expect(gameAudio.isPausedForRecording()).toBe(true);
    gameAudio.resumeAfterRecording();
    expect(gameAudio.isPausedForRecording()).toBe(false);
  });
});
