import { useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, json } from '../lib/api';
import { useVoice } from '../lib/voice-context';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { Modal } from './feedback';
import { useToast } from './feedback-context';
import { Button, ErrorState, Textarea } from './ui';

function formatSeconds(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type SheetMode = 'choose' | 'recording' | 'processing';

function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
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

  async function submit(body: RequestInit) {
    setMode('processing');
    setError('');
    try {
      await api('/api/captures', body);
      toast('Captura enviada. Revise quando quiser.');
      setMode('choose');
      setText('');
      onClose();
      navigate('/revisar');
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
    await submit({ method: 'POST', body: form });
  }

  async function sendText() {
    if (!text.trim()) return;
    await submit(json('POST', { text: text.trim() }));
  }

  return <Modal open={open} title="Assistente de registros" description="Fale naturalmente. Nada é salvo sem a sua revisão." onClose={close}>
    {mode === 'processing' ? <div className="flex items-center gap-3 py-8 text-sm text-[var(--muted)]"><Loader2 className="animate-spin" size={20} aria-hidden /> Processando a captura…</div>
      : mode === 'recording' ? <div className="grid justify-items-center gap-4 py-4 text-center">
        <div className="text-4xl font-bold tabular-nums">{formatSeconds(recorder.seconds)}</div>
        <p className="text-sm text-[var(--muted)]">Gravando… fale e toque em parar.</p>
        <Button variant="danger" onClick={() => recorder.stop()}><Square size={16} aria-hidden /> Parar e enviar</Button>
      </div>
        : <div className="grid gap-4">
          {error && <ErrorState message={error} />}
          <button type="button" className="button button-primary w-full" data-autofocus onClick={() => void record()}><Mic size={18} aria-hidden /> Gravar áudio</button>
          <div className="grid gap-2">
            <Textarea placeholder="Ou digite: hoje o primeiro lote tirou 700 litros de manhã…" value={text} onChange={(event) => setText(event.target.value)} />
            <Button variant="secondary" disabled={!text.trim()} onClick={() => void sendText()}>Enviar texto</Button>
          </div>
        </div>}
  </Modal>;
}

export function CaptureCard() {
  const { voiceEnabled } = useVoice();
  const [open, setOpen] = useState(false);
  return <section className="capture-card">
    <div className="flex items-center gap-2"><Mic size={20} aria-hidden /><strong className="text-base">Assistente de registros</strong></div>
    <p className="mt-1"><small>Fale o que aconteceu — “hoje o primeiro lote tirou 700 litros de manhã”. Você revisa antes de salvar.</small></p>
    {voiceEnabled
      ? <><button type="button" className="capture-action mt-3" onClick={() => setOpen(true)}><Mic size={18} aria-hidden /> Começar</button><CaptureSheet open={open} onClose={() => setOpen(false)} /></>
      : <p className="mt-3"><small>Defina <code>OPENROUTER_API_KEY</code> no ambiente para ativar.</small></p>}
    <Link to="/revisar" className="mt-3 inline-block text-sm font-semibold underline">Ver capturas para revisar</Link>
  </section>;
}

export function MicFab() {
  const { voiceEnabled } = useVoice();
  const [open, setOpen] = useState(false);
  if (!voiceEnabled) return null;
  return <>
    <button type="button" className="mic-fab" aria-label="Assistente de registros" onClick={() => setOpen(true)}><Mic size={24} aria-hidden /></button>
    <CaptureSheet open={open} onClose={() => setOpen(false)} />
  </>;
}
