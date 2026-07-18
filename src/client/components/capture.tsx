import { useState } from 'react';
import { Camera, Loader2, Mic, Plus, Square } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ENTRY_TYPES } from '../config/entries';
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

  async function sendDocument(file: File) {
    const form = new FormData();
    form.append('document', file);
    if (text.trim()) form.append('context', text.trim());
    await submit({ method: 'POST', body: form });
  }

  return <Modal open={open} title="Assistente de registros" description="Diga o que aconteceu e o assistente preenche — ou registre direto." onClose={close}>
    {mode === 'processing' ? <div className="flex items-center gap-3 py-8 text-sm text-[var(--muted)]"><Loader2 className="animate-spin" size={20} aria-hidden /> Processando a captura…</div>
      : mode === 'recording' ? <div className="grid justify-items-center gap-4 py-4 text-center">
        <div className="text-4xl font-bold tabular-nums">{formatSeconds(recorder.seconds)}</div>
        <p className="text-sm text-[var(--muted)]">Gravando… fale e toque em parar.</p>
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

export function CaptureCard() {
  const [open, setOpen] = useState(false);
  return <section className="capture-card">
    <div className="flex items-center gap-2"><Plus size={20} aria-hidden /><strong className="text-base">Assistente de registros</strong></div>
    <p className="mt-1"><small>A forma principal de lançar no sistema: fale, fotografe ou registre direto — sempre com revisão antes de virar fato.</small></p>
    <button type="button" className="capture-action mt-3" onClick={() => setOpen(true)}><Plus size={18} aria-hidden /> Novo registro</button>
    <Link to="/revisar" className="mt-3 inline-block text-sm font-semibold underline">Ver capturas para revisar</Link>
    <CaptureSheet open={open} onClose={() => setOpen(false)} />
  </section>;
}

export function MicFab() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="mic-fab" aria-label="Assistente de registros — novo registro" onClick={() => setOpen(true)}><Plus size={26} aria-hidden /></button>
    <CaptureSheet open={open} onClose={() => setOpen(false)} />
  </>;
}
