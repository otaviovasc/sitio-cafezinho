import { useCallback, useRef, useState } from 'react';

// iOS Safari grava audio/mp4 (AAC); Chrome/Android grava audio/webm (opus).
// Todos são aceitos pela transcrição do OpenRouter — escolhemos o primeiro que
// o navegador suportar.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? '';
}

export type RecordingResult = { blob: Blob; mime: string; filename: string };

export function useAudioRecorder(maxSeconds = 60) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  // Deve ser chamado dentro do gesto do usuário (clique). Resolve quando a
  // gravação parar, com o áudio, ou null se falhar/ficar vazio.
  const start = useCallback(async (): Promise<RecordingResult | null> => {
    setError('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador não permite gravar áudio.');
      return null;
    }
    const mime = pickMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      setSeconds(0);
      const done = new Promise<RecordingResult | null>((resolve) => {
        recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
        recorder.onstop = () => {
          const type = recorder.mimeType || mime || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          const ext = type.includes('mp4') || type.includes('aac') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
          cleanup();
          resolve(blob.size > 0 ? { blob, mime: type, filename: `captura.${ext}` } : null);
        };
      });
      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => {
          const next = current + 1;
          if (next >= maxSeconds) stop();
          return next;
        });
      }, 1000);
      return done;
    } catch {
      setError('Não foi possível acessar o microfone. Autorize o acesso e tente de novo.');
      cleanup();
      return null;
    }
  }, [cleanup, maxSeconds, stop]);

  return { recording, seconds, error, start, stop };
}
