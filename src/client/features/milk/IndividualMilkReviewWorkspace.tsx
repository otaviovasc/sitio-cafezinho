import { FileText, Images } from 'lucide-react';
import { FactSequence } from '../../components/fact-sequence';
import { GameReviewNotice } from '../game/GameReviewNotice';
import { GameSheet } from '../game/GameSheet';
import type { ReviewOutcome, ReviewableAction } from '../game/review';
import { MangueiraSprite } from '../game/sprites/MangueiraSprite';
import { ImportMilkReview } from './ImportMilkReview';

export type IndividualMilkReviewSource = {
  captureId: string;
  attachmentId: string | null;
  filename: string | null;
  mimeType: string | null;
  transcript: string | null;
  ordinal?: number;
  storageWarning?: string | null;
};

export type IndividualMilkRelatedReview = {
  action: ReviewableAction;
  import: Record<string, unknown>;
  sourceActions: Array<{ captureId: string; actionId: string }>;
  documents: IndividualMilkReviewSource[];
};

export function IndividualMilkReviewWorkspace({ review, onClose, onDone }: {
  review: IndividualMilkRelatedReview;
  onClose: () => void;
  onDone: (outcome: ReviewOutcome) => void;
}) {
  const metadataReview = (review.import.metadataReview ?? {}) as {
    dateRequired?: boolean;
    groupRequired?: boolean;
    periodRequired?: boolean;
  };
  const contextPending = Boolean(metadataReview.dateRequired || metadataReview.groupRequired || metadataReview.periodRequired);
  return <GameSheet
    open
    label="Revisão do controle individual"
    testid="individual-milk-review-workspace"
    title="Revisar controle individual"
    subtitle={`${review.sourceActions.length} ${review.sourceActions.length === 1 ? 'anotação reunida' : 'anotações reunidas'} · confira a imagem e a medição de cada animal`}
    className="game-review-workspace"
    onClose={onClose}
    sprite={<MangueiraSprite x={32} y={32} size={64} />}
  >
    <div className="game-review-workspace-content">
      <FactSequence
        className="game-review-sequence"
        items={[
          { key: 'source', label: 'Origem', description: `${review.documents.length} ${review.documents.length === 1 ? 'foto ou documento' : 'fotos ou documentos'} na ordem enviada`, tone: 'complete' },
          { key: 'context', label: 'Contexto', description: 'Data, lote e período de cada anotação', tone: contextPending ? 'current' : 'complete' },
          { key: 'measurements', label: 'Medições', description: 'Confira cada vaca e os litros lidos', tone: contextPending ? undefined : 'current' },
          { key: 'changes', label: 'Mudanças', description: 'Decida somente as trocas de lote sugeridas' },
          { key: 'confirmation', label: 'Confirmação', description: 'Salve apenas depois da revisão' },
        ]}
      />
      <div className="game-review-workspace-grid">
      <aside className="game-review-sources" aria-label="Imagens e transcrições de origem">
        <div className="game-review-sources-title"><Images size={18} aria-hidden /><strong>Fontes originais</strong></div>
        {review.documents.map((document, index) => <article key={`${document.captureId}-${document.ordinal ?? index}`} className="game-review-source">
          <strong>Foto {document.ordinal ?? index + 1}{document.filename ? ` · ${document.filename}` : ''}</strong>
          {document.storageWarning && <div className="notice notice-warning text-sm">{document.storageWarning}</div>}
          {document.attachmentId && document.mimeType?.startsWith('image/')
            ? <img src={`/api/attachments/${document.attachmentId}/file`} alt={`Anotação original da foto ${document.ordinal ?? index + 1}`} />
            : document.attachmentId && document.mimeType === 'application/pdf'
              ? <iframe src={`/api/attachments/${document.attachmentId}/file`} title={`Documento original da foto ${document.ordinal ?? index + 1}`} />
              : !document.storageWarning && <div className="notice notice-warning text-sm"><FileText size={17} aria-hidden /> A leitura foi preservada, mas o arquivo original não foi armazenado.</div>}
          <details>
            <summary>Ver texto extraído</summary>
            <pre>{document.transcript || 'Texto não disponível.'}</pre>
          </details>
        </article>)}
      </aside>
      <main className="game-review-form">
        <GameReviewNotice action={review.action} onDone={onDone} />
        <ImportMilkReview
          prefillJson={JSON.stringify(review.import)}
          sourceActions={review.sourceActions}
          onSaved={() => onDone('committed')}
        />
      </main>
      </div>
    </div>
  </GameSheet>;
}
