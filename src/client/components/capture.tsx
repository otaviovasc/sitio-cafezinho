import { useState } from 'react';
import { Camera, ChevronDown, ChevronUp, Loader2, Mic, Plus, Square, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ENTRY_TYPES } from '../config/entries';
import { api, ApiError, json } from '../lib/api';
import { useVoice } from '../lib/voice-context';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { reviewDestination, type ReviewableAction } from '../features/game/review';
import { gameAudio } from '../features/game/audio';
import { Modal } from './feedback';
import { useToast } from './feedback-context';
import { Button, ErrorState, Field, Textarea } from './ui';

function formatSeconds(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type CaptureWarning = string | { message?: string; code?: string; documentOrdinal?: number };
type CaptureResult = {
  captureId: string;
  actions: ReviewableAction[];
  warnings?: CaptureWarning[];
};
type SelectedDocument = {
  id: string;
  file: File;
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
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);

  function close() {
    if (mode === 'processing') return;
    setMode('choose');
    setText('');
    setError('');
    setDocuments([]);
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
      const warnings = result.warnings ?? [];
      if (warnings.length) {
        toast({
          title: 'Leitura pronta, com um aviso',
          message: warnings.map((warning) => typeof warning === 'string' ? warning : warning.message ?? 'Um original não foi armazenado.').join(' '),
          tone: 'warning',
          duration: 5000,
        });
      } else {
        toast('Captura enviada. Revise quando quiser.');
      }
      setMode('choose');
      setText('');
      setDocuments([]);
      onClose();
      // Destino óbvio: uma única ação pendente abre a folha do fato em modo
      // revisão, já preenchida. Ambíguo/múltiplo/não reconhecido: caderno na
      // aba Pendências (fallback).
      const pending = (result.actions ?? []).filter((action) => action.status === 'NEEDS_REVIEW');
      const firstIndividual = pending.find((action) => action.actionType === 'INDIVIDUAL_MILK_SESSION');
      const directAction = pending.length === 1 ? pending[0] : firstIndividual;
      const target = directAction ? reviewDestination(directAction) : null;
      if (directAction && target) {
        navigate('/', { state: { reviewCaptureId: result.captureId, reviewActionId: directAction.id } });
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
    gameAudio.pauseForRecording();
    let result;
    try {
      result = await recorder.start();
    } finally {
      gameAudio.resumeAfterRecording();
    }
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

  async function sendDocuments() {
    if (!documents.length) return;
    const form = new FormData();
    for (const document of documents) form.append('document', document.file);
    if (text.trim()) form.append('context', text.trim());
    await submit({ method: 'POST', body: form });
  }

  function addDocuments(files: File[]) {
    const selected = files.map((file, index) => ({ id: `${Date.now()}-${index}-${file.name}-${file.size}`, file }));
    setError('');
    setDocuments((current) => [...current, ...selected]);
  }

  function moveDocument(index: number, direction: -1 | 1) {
    setDocuments((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  return <Modal open={open} title="Assistente de registros" description="Diga o que aconteceu e o assistente preenche — ou registre direto." onClose={close}>
    {mode === 'processing' ? <div className="flex items-center gap-3 py-8 text-sm text-[var(--muted)]"><Loader2 className="animate-spin" size={20} aria-hidden /> Processando a captura…</div>
      : mode === 'recording' ? <div className="grid justify-items-center gap-4 py-4 text-center">
        <div className="text-4xl font-bold tabular-nums" data-testid="capture-recording-timer">{formatSeconds(Math.max(0, recorder.maxSeconds - recorder.seconds))}</div>
        <p className="text-sm text-[var(--muted)]">Gravando… o tempo mostrado é o que RESTA do limite de {recorder.maxSeconds}s. O som do jogo fica pausado. Fale e toque em parar.</p>
        {recorder.maxSeconds - recorder.seconds <= 10 && <p className="notice notice-warning text-sm" data-testid="capture-recording-warning">O limite está chegando. Para controles longos (muitas vacas), pare e fotografe a anotação — a foto não tem limite de tempo.</p>}
        <Button variant="danger" onClick={() => recorder.stop()}><Square size={16} aria-hidden /> Parar e enviar</Button>
      </div>
        : <div className="grid gap-5">
          {error && <ErrorState message={error} />}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Deixe o assistente preencher</p>
            {voiceEnabled
              ? <div className="grid gap-2">
                {!documents.length && <button type="button" className="button button-primary w-full" data-autofocus onClick={() => void record()}><Mic size={18} aria-hidden /> Falar</button>}
                <label className="button button-secondary w-full cursor-pointer">
                  <Camera size={18} aria-hidden /> {documents.length ? 'Adicionar mais fotos' : 'Escolher fotos ou documentos'}
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = '';
                    if (files.length) addDocuments(files);
                  }} />
                </label>
                {documents.length > 0 && <div className="grid gap-3" aria-live="polite">
                  <div className="capture-document-list" aria-label="Fotos na ordem de leitura">
                    {documents.map((document, index) => <div key={document.id} className="capture-document-item">
                      <span className="capture-document-number">Foto {index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{document.file.name}</span>
                      <button
                        type="button"
                        className="capture-document-remove"
                        disabled={index === 0}
                        aria-label={`Mover Foto ${index + 1} para cima`}
                        onClick={() => moveDocument(index, -1)}
                      ><ChevronUp size={18} aria-hidden /></button>
                      <button
                        type="button"
                        className="capture-document-remove"
                        disabled={index === documents.length - 1}
                        aria-label={`Mover Foto ${index + 1} para baixo`}
                        onClick={() => moveDocument(index, 1)}
                      ><ChevronDown size={18} aria-hidden /></button>
                      <button
                        type="button"
                        className="capture-document-remove"
                        aria-label={`Remover Foto ${index + 1}: ${document.file.name}`}
                        onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))}
                      ><Trash2 size={18} aria-hidden /></button>
                    </div>)}
                  </div>
                  <p className="text-xs leading-5 text-[var(--muted)]">A ordem acima será preservada. No contexto, diga o que é cada uma: “Foto 1, lote 1, manhã; Foto 2, mesmo lote, tarde”.</p>
                </div>}
                <Field
                  label={documents.length ? 'Contexto das fotos' : 'Descreva o registro'}
                  hint={documents.length ? 'Informe data, lote e período de cada foto quando isso não estiver escrito nela.' : undefined}
                >
                  <Textarea
                    aria-label={documents.length ? 'Contexto das fotos' : 'Texto do registro'}
                    placeholder={documents.length ? 'Ex.: Foto 1: lote 1, 28/07/2026, manhã. Foto 2: mesmo lote e data, tarde.' : 'Ex.: hoje o primeiro lote tirou 700 litros de manhã…'}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </Field>
                {documents.length
                  ? <Button onClick={() => void sendDocuments()}>
                    Processar {documents.length} {documents.length === 1 ? 'foto' : 'fotos'}
                  </Button>
                  : <Button variant="secondary" disabled={!text.trim()} onClick={() => void sendText()}>Enviar texto</Button>}
                <p className="text-xs text-[var(--muted)]">{documents.length
                  ? 'As fotos e o contexto escrito serão enviados juntos, preservando a ordem acima.'
                  : `Áudio tem limite de ${recorder.maxSeconds}s. Controle longo? Fotografe a anotação — a revisão abre vaca a vaca do mesmo jeito.`}</p>
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
