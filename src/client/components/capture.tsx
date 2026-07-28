import { useState } from 'react';
import { Camera, Loader2, Mic, Plus, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ENTRY_TYPES } from '../config/entries';
import { api, ApiError, json } from '../lib/api';
import { useVoice } from '../lib/voice-context';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { reviewDestination, type ReviewableAction } from '../features/game/review';
import { Modal } from './feedback';
import { useToast } from './feedback-context';
import { Button, ErrorState, Textarea } from './ui';

function formatSeconds(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type CaptureResult = { captureId: string; actions: ReviewableAction[] };

type SheetMode = 'choose' | 'recording' | 'processing';

function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { voiceEnabled } = useVoice();
  const recorder = useAudioRecorder();
  const [mode, setMode] = useState<SheetMode>('choose');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function close() {
    if (mode === 'processing') return;
    setMode('choose');
    setText('');
    setError('');
    onClose();
  }

  function go(to: string) {
    close();
    navigate(to);
  }

  async function submit(body: RequestInit) {
    setMode('processing');
    setError('');
    try {
      const result = await api<CaptureResult>('/api/captures', body);
      toast('Captura enviada. Revise quando quiser.');
      setMode('choose');
      setText('');
      onClose();
      // Destino óbvio: uma única ação pendente abre a folha do fato em modo
      // revisão, já preenchida. Ambíguo/múltiplo/não reconhecido: caderno na
      // aba Pendências (fallback).
      const pending = (result.actions ?? []).filter((action) => action.status === 'NEEDS_REVIEW');
      const target = pending.length === 1 ? reviewDestination(pending[0]) : null;
      if (pending.length === 1 && target) {
        navigate('/', { state: { reviewCaptureId: result.captureId, reviewActionId: pending[0].id } });
      } else {
        navigate('/', { state: { openNotebook: 'pendencias' } });
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível processar a captura.');
      setMode('choose');
    }
  }

  async function record() {
    setMode('recording');
    const result = await recorder.start();
    if (!result) {
      setError(recorder.error || 'A gravação ficou vazia. Tente de novo.');
      setMode('choose');
      return;
    }
    const form = new FormData();
    form.append('audio', result.blob, result.filename);
    form.append('durationSeconds', result.durationSeconds.toFixed(3));
    await submit({ method: 'POST', body: form });
  }

  async function sendText() {
    if (!text.trim()) return;
    await submit(json('POST', { text: text.trim() }));
  }

  async function sendDocument(file: File) {
    const form = new FormData();
    form.append('document', file);
    if (text.trim()) form.append('context', text.trim());
    await submit({ method: 'POST', body: form });
  }

  return <Modal open={open} title="Assistente de registros" description="Diga o que aconteceu e o assistente preenche — ou registre direto." onClose={close}>
    {mode === 'processing' ? <div className="flex items-center gap-3 py-8 text-sm text-[var(--muted)]"><Loader2 className="animate-spin" size={20} aria-hidden /> Processando a captura…</div>
      : mode === 'recording' ? <div className="grid justify-items-center gap-4 py-4 text-center">
        <div className="text-4xl font-bold tabular-nums" data-testid="capture-recording-timer">{formatSeconds(Math.max(0, recorder.maxSeconds - recorder.seconds))}</div>
        <p className="text-sm text-[var(--muted)]">Gravando… o tempo mostrado é o que RESTA do limite de {recorder.maxSeconds}s. Fale e toque em parar.</p>
        {recorder.maxSeconds - recorder.seconds <= 10 && <p className="notice notice-warning text-sm" data-testid="capture-recording-warning">O limite está chegando. Para controles longos (muitas vacas), pare e fotografe a anotação — a foto não tem limite de tempo.</p>}
        <Button variant="danger" onClick={() => recorder.stop()}><Square size={16} aria-hidden /> Parar e enviar</Button>
      </div>
        : <div className="grid gap-5">
          {error && <ErrorState message={error} />}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Deixe o assistente preencher</p>
            {voiceEnabled
              ? <div className="grid gap-2">
                <button type="button" className="button button-primary w-full" data-autofocus onClick={() => void record()}><Mic size={18} aria-hidden /> Falar</button>
                <label className="button button-secondary w-full cursor-pointer">
                  <Camera size={18} aria-hidden /> Foto ou documento
                  <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendDocument(file); }} />
                </label>
                <Textarea placeholder="Ou escreva: hoje o primeiro lote tirou 700 litros de manhã… (também vira contexto da foto)" value={text} onChange={(event) => setText(event.target.value)} />
                <Button variant="secondary" disabled={!text.trim()} onClick={() => void sendText()}>Enviar texto</Button>
                <p className="text-xs text-[var(--muted)]">Áudio tem limite de {recorder.maxSeconds}s. Controle longo? Fotografe a anotação — a revisão abre vaca a vaca do mesmo jeito.</p>
              </div>
              : <p className="notice notice-info text-sm">Defina <code>OPENROUTER_API_KEY</code> no ambiente para ativar áudio, foto e texto livres. Os registros diretos abaixo funcionam sempre.</p>}
          </section>
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Registro rápido</p>
            <div className="grid grid-cols-2 gap-2">
              {ENTRY_TYPES.map((entry) => <button key={entry.key} type="button" className="quick-action min-h-16" onClick={() => go(entry.route)}><entry.icon size={20} aria-hidden /><strong>{entry.label}</strong></button>)}
            </div>
          </section>
        </div>}
  </Modal>;
}

export function MicFab() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="mic-fab" aria-label="Assistente de registros — novo registro" onClick={() => setOpen(true)}><Plus size={26} aria-hidden /></button>
    <CaptureSheet open={open} onClose={() => setOpen(false)} />
  </>;
}
