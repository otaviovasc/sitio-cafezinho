import { useState } from 'react';
import { Camera, CheckCircle2, Loader2, Mic, Plus, Square, XCircle } from 'lucide-react';
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
type DocumentJob = {
  id: string;
  filename: string;
  status: 'PROCESSING' | 'DONE' | 'ERROR';
  result?: CaptureResult;
  error?: string;
};

type SheetMode = 'choose' | 'recording' | 'processing';

function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { voiceEnabled } = useVoice();
  const recorder = useAudioRecorder();
  const [mode, setMode] = useState<SheetMode>('choose');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [documentJobs, setDocumentJobs] = useState<DocumentJob[]>([]);
  const processingDocuments = documentJobs.some((job) => job.status === 'PROCESSING');

  function close() {
    if (mode === 'processing' || processingDocuments) return;
    setMode('choose');
    setText('');
    setError('');
    setDocumentJobs([]);
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

  async function sendDocument(file: File, jobId: string) {
    const form = new FormData();
    form.append('document', file);
    if (text.trim()) form.append('context', text.trim());
    try {
      const result = await api<CaptureResult>('/api/captures', { method: 'POST', body: form });
      setDocumentJobs((jobs) => jobs.map((job) => job.id === jobId ? { ...job, status: 'DONE', result } : job));
    } catch (cause) {
      setDocumentJobs((jobs) => jobs.map((job) => job.id === jobId ? {
        ...job,
        status: 'ERROR',
        error: cause instanceof ApiError ? cause.message : 'Não foi possível processar esta imagem.',
      } : job));
    }
  }

  function sendDocuments(files: File[]) {
    const jobs = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      filename: file.name,
      status: 'PROCESSING' as const,
      file,
    }));
    setError('');
    setDocumentJobs((current) => [...current, ...jobs.map(({ file: _file, ...job }) => job)]);
    for (const job of jobs) void sendDocument(job.file, job.id);
  }

  function reviewDocuments() {
    const firstPending = documentJobs.flatMap((job) => {
      const result = job.result;
      if (!result) return [];
      return result.actions.filter((action) => action.status === 'NEEDS_REVIEW')
        .map((action) => ({ captureId: result.captureId, action }));
    })[0];
    setDocumentJobs([]);
    setText('');
    onClose();
    if (firstPending) {
      navigate('/', { state: { reviewCaptureId: firstPending.captureId, reviewActionId: firstPending.action.id } });
    } else {
      navigate('/', { state: { openNotebook: 'pendencias' } });
    }
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
                  <Camera size={18} aria-hidden /> Fotos ou documentos
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = '';
                    if (files.length) sendDocuments(files);
                  }} />
                </label>
                {documentJobs.length > 0 && <div className="grid gap-2" aria-live="polite">
                  {documentJobs.map((job) => <div key={job.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                    {job.status === 'PROCESSING'
                      ? <Loader2 className="shrink-0 animate-spin" size={17} aria-hidden />
                      : job.status === 'DONE'
                        ? <CheckCircle2 className="shrink-0 text-[var(--ok)]" size={17} aria-hidden />
                        : <XCircle className="shrink-0 text-[var(--danger)]" size={17} aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{job.filename}</span>
                    <small className="text-[var(--muted)]">{job.status === 'PROCESSING' ? 'Lendo…' : job.status === 'DONE' ? 'Pronta' : job.error}</small>
                  </div>)}
                  {!processingDocuments && documentJobs.some((job) => job.status === 'DONE') && <Button onClick={reviewDocuments}>
                    Revisar {documentJobs.filter((job) => job.status === 'DONE').length > 1 ? 'imagens juntas' : 'imagem'}
                  </Button>}
                  <p className="text-xs text-[var(--muted)]">Você pode escolher mais arquivos enquanto os anteriores são lidos. Controles da mesma data e lote serão reunidos automaticamente.</p>
                </div>}
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
