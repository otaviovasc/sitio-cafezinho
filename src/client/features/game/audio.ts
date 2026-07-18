/**
 * Áudio do jogo: trilha ambiente + efeitos curtos. Os arquivos reais vivem em
 * `public/audio/game/` (lista em GAME_AUDIO_FILES; veja o README da pasta) —
 * enquanto um arquivo não existir, um placeholder sintetizado via WebAudio toca
 * no lugar, então o jogo já soa completo sem nenhum asset binário no repo.
 *
 * Regras:
 * - Nada toca antes do primeiro gesto do usuário (política de autoplay);
 *   `init()` arma o unlock e a trilha começa sozinha no primeiro toque.
 * - Mudo é persistido em localStorage ('game-audio-muted') e vale para tudo.
 * - A trilha pausa quando a aba perde visibilidade.
 */

export type GameSoundKey = 'moo' | 'click' | 'pour' | 'truck' | 'feed' | 'plant' | 'harvest' | 'success' | 'buy';

/** Caminhos públicos dos arquivos de áudio — substitua pelos definitivos mantendo os nomes. */
export const GAME_AUDIO_FILES: Record<GameSoundKey | 'soundtrack', string> = {
  soundtrack: '/audio/game/soundtrack.mp3',
  moo: '/audio/game/moo.mp3',
  click: '/audio/game/click.mp3',
  pour: '/audio/game/milk-pour.mp3',
  truck: '/audio/game/truck.mp3',
  feed: '/audio/game/feed.mp3',
  plant: '/audio/game/plant.mp3',
  harvest: '/audio/game/harvest.mp3',
  success: '/audio/game/success.mp3',
  buy: '/audio/game/buy.mp3',
};

const MUTED_KEY = 'game-audio-muted';
const SFX_VOLUME = 0.5;
const SOUNDTRACK_VOLUME = 0.32;
const SYNTH_PAD_VOLUME = 0.045;

type Listener = () => void;

let muted = readMuted();
let unlocked = false;
let initCount = 0;
let context: AudioContext | null = null;
const listeners = new Set<Listener>();
/** Elementos por som; null = arquivo ausente confirmado (usa o sintetizador). */
const elements = new Map<string, HTMLAudioElement | null>();
let soundtrackElement: HTMLAudioElement | null = null;
let padNodes: { stop: () => void } | null = null;
let melodyTimer: number | null = null;

function readMuted(): boolean {
  try { return localStorage.getItem(MUTED_KEY) === '1'; } catch { return false; }
}

function notify() { listeners.forEach((listener) => listener()); }

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** Carrega (uma vez) o elemento de um som; resolve null se o arquivo faltar. */
function loadElement(key: GameSoundKey | 'soundtrack'): Promise<HTMLAudioElement | null> {
  const cached = elements.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const element = new Audio(GAME_AUDIO_FILES[key]);
    element.preload = 'auto';
    const settle = (found: HTMLAudioElement | null) => {
      elements.set(key, found);
      resolve(found);
    };
    element.addEventListener('canplaythrough', () => settle(element), { once: true });
    element.addEventListener('error', () => settle(null), { once: true });
    element.load();
  });
}

// --- Placeholders sintetizados (tocam só enquanto o arquivo real não existe) ---

function envelope(ctx: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  gain.connect(ctx.destination);
  return gain;
}

function tone(ctx: AudioContext, at: number, type: OscillatorType, from: number, to: number, peak: number, attack: number, decay: number) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
  osc.connect(envelope(ctx, at, peak, attack, decay));
  osc.start(at);
  osc.stop(at + attack + decay + 0.05);
}

function noise(ctx: AudioContext, at: number, duration: number, filterFrom: number, filterTo: number, peak: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(filterFrom, at);
  filter.frequency.linearRampToValueAtTime(filterTo, at + duration);
  source.connect(filter);
  filter.connect(envelope(ctx, at, peak, duration * 0.2, duration * 0.8));
  source.start(at);
}

function playSynth(key: GameSoundKey) {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  switch (key) {
    case 'moo': {
      // Duas "sílabas" descendentes com filtro grave — o mugido de mentirinha.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.connect(ctx.destination);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.08);
      gain.gain.setValueAtTime(0.5, now + 0.42);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
      gain.connect(filter);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.linearRampToValueAtTime(140, now + 0.25);
      osc.frequency.setValueAtTime(120, now + 0.3);
      osc.frequency.exponentialRampToValueAtTime(88, now + 0.75);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.85);
      break;
    }
    case 'click':
      tone(ctx, now, 'triangle', 700, 900, 0.25, 0.01, 0.07);
      break;
    case 'pour':
      noise(ctx, now, 0.6, 500, 1400, 0.3);
      tone(ctx, now + 0.1, 'sine', 620, 840, 0.06, 0.2, 0.3);
      break;
    case 'truck': {
      tone(ctx, now, 'square', 82, 70, 0.14, 0.05, 0.7);
      tone(ctx, now + 0.12, 'sine', 330, 330, 0.2, 0.02, 0.22);
      tone(ctx, now + 0.12, 'sine', 415, 415, 0.2, 0.02, 0.22);
      break;
    }
    case 'feed':
      noise(ctx, now, 0.28, 900, 400, 0.28);
      break;
    case 'plant':
      tone(ctx, now, 'sine', 150, 90, 0.4, 0.01, 0.16);
      noise(ctx, now + 0.06, 0.2, 1200, 700, 0.16);
      break;
    case 'buy': {
      // Caixa registradora de mentirinha: duas moedinhas agudas.
      tone(ctx, now, 'sine', 1318.5, 1318.5, 0.2, 0.005, 0.12);
      tone(ctx, now + 0.09, 'sine', 1760, 1760, 0.2, 0.005, 0.2);
      break;
    }
    case 'harvest':
    case 'success': {
      const notes = key === 'harvest' ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 880];
      notes.forEach((frequency, index) => tone(ctx, now + index * 0.09, 'triangle', frequency, frequency, 0.22, 0.01, 0.3));
      break;
    }
  }
}

/** Trilha placeholder: colchão de duas senoides + arpejo pentatônico esparso. */
function startSynthPad() {
  const ctx = getContext();
  if (!ctx || padNodes) return;
  const master = ctx.createGain();
  master.gain.value = SYNTH_PAD_VOLUME;
  master.connect(ctx.destination);
  const oscillators = [130.81, 196.0, 261.63].map((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    osc.detune.value = index * 3;
    osc.connect(master);
    osc.start();
    return osc;
  });
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = SYNTH_PAD_VOLUME * 0.5;
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);
  lfo.start();
  const scale = [523.25, 587.33, 659.25, 783.99, 880];
  let step = 0;
  melodyTimer = window.setInterval(() => {
    if (!ctx || muted) return;
    const note = scale[(step * 3 + (step % 2)) % scale.length];
    tone(ctx, ctx.currentTime + 0.01, 'sine', note, note, 0.05, 0.05, 1.6);
    step += 1;
  }, 3600);
  padNodes = {
    stop: () => {
      if (melodyTimer !== null) window.clearInterval(melodyTimer);
      melodyTimer = null;
      [...oscillators, lfo].forEach((osc) => { try { osc.stop(); } catch { /* já parado */ } });
      master.disconnect();
    },
  };
}

function stopSynthPad() {
  padNodes?.stop();
  padNodes = null;
}

// --- Trilha (arquivo real quando existir; senão o pad sintetizado) ---

async function startSoundtrack() {
  if (muted || !unlocked) return;
  const element = await loadElement('soundtrack');
  if (muted || !unlocked) return;
  if (element) {
    soundtrackElement = element;
    element.loop = true;
    element.volume = SOUNDTRACK_VOLUME;
    void element.play().catch(() => { /* autoplay negado: tenta no próximo gesto */ });
    return;
  }
  startSynthPad();
}

function stopSoundtrack() {
  soundtrackElement?.pause();
  stopSynthPad();
}

function handleVisibility() {
  if (document.hidden) stopSoundtrack();
  else if (initCount > 0) void startSoundtrack();
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  void getContext()?.resume();
  void startSoundtrack();
}

export const gameAudio = {
  /** Monta os listeners (gesto de unlock + visibilidade). Par com dispose(). */
  init() {
    initCount += 1;
    if (initCount > 1) return;
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', handleVisibility);
  },
  dispose() {
    initCount = Math.max(0, initCount - 1);
    if (initCount > 0) return;
    window.removeEventListener('pointerdown', unlock, { capture: true });
    window.removeEventListener('keydown', unlock, { capture: true });
    document.removeEventListener('visibilitychange', handleVisibility);
    stopSoundtrack();
    unlocked = false;
  },
  isMuted() { return muted; },
  toggleMuted() {
    muted = !muted;
    try { localStorage.setItem(MUTED_KEY, muted ? '1' : '0'); } catch { /* modo privado */ }
    if (muted) stopSoundtrack();
    else void startSoundtrack();
    notify();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Toca um efeito; se o arquivo não existir, cai no placeholder sintetizado. */
  play(key: GameSoundKey) {
    if (muted || !unlocked) return;
    void loadElement(key).then((element) => {
      if (muted) return;
      if (!element) {
        playSynth(key);
        return;
      }
      const instance = element.cloneNode(true) as HTMLAudioElement;
      instance.volume = SFX_VOLUME;
      void instance.play().catch(() => playSynth(key));
    });
  },
};
