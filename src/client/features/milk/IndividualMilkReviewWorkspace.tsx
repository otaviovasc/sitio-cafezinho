import { FileText, Images } from 'lucide-react';
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
  transcript: string;
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
  return <GameSheet
    open
    label="Revisão do controle individual"
    testid="individual-milk-review-workspace"
    title="Revisar controle individual"
    subtitle={`${review.sourceActions.length} ${review.sourceActions.length === 1 ? 'captura reunida' : 'capturas reunidas'} · confira a imagem e a medição de cada animal`}
    className="game-review-workspace"
    onClose={onClose}
    sprite={<MangueiraSprite x={32} y={32} size={64} />}
  >
    <div className="game-review-workspace-grid">
      <aside className="game-review-sources" aria-label="Imagens e transcrições de origem">
        <div className="game-review-sources-title"><Images size={18} aria-hidden /><strong>Fontes originais</strong></div>
        {review.documents.map((document, index) => <article key={document.captureId} className="game-review-source">
          <strong>Captura {index + 1}{document.filename ? ` · ${document.filename}` : ''}</strong>
          {document.attachmentId && document.mimeType?.startsWith('image/')
            ? <img src={`/api/attachments/${document.attachmentId}/file`} alt={`Anotação original da captura ${index + 1}`} />
            : document.attachmentId && document.mimeType === 'application/pdf'
              ? <iframe src={`/api/attachments/${document.attachmentId}/file`} title={`Documento original da captura ${index + 1}`} />
              : <div className="notice notice-info text-sm"><FileText size={17} aria-hidden /> A imagem desta captura antiga não foi armazenada.</div>}
          <details>
            <summary>Ver texto extraído</summary>
            <pre>{document.transcript}</pre>
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
  </GameSheet>;
}
