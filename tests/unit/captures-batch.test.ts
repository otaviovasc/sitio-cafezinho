import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureMultipartSizeIssue,
  mapWithConcurrency,
  MAX_CAPTURE_MULTIPART_BYTES,
  prepareDocumentStorage,
} from '../../src/server/routes/captures.routes';

function document(ordinal: number) {
  return {
    buffer: Buffer.from(`foto-${ordinal}`),
    filename: `foto-${ordinal}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 6,
    ordinal,
    sha256: 'mesmo-hash',
    ocrText: `Vaca ${ordinal}: 5`,
    ocrRaw: null,
    ocrModel: 'test',
    ocrStatus: 'AVAILABLE' as const,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mapWithConcurrency', () => {
  it('preserva a ordem dos documentos e limita o trabalho simultâneo', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([30, 5, 20, 1], 2, async (delay, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return `documento-${index + 1}`;
    });

    expect(result).toEqual(['documento-1', 'documento-2', 'documento-3', 'documento-4']);
    expect(peak).toBe(2);
  });

  it('aceita uma lista vazia', async () => {
    await expect(mapWithConcurrency([], 3, async (item) => item)).resolves.toEqual([]);
  });
});

describe('limite agregado da captura multipart', () => {
  it('aceita áudio e documentos exatamente no teto', () => {
    expect(captureMultipartSizeIssue(20 * 1024 * 1024, [
      15 * 1024 * 1024,
      15 * 1024 * 1024,
    ])).toBeNull();
  });

  it('rejeita o conjunto acima de 50 MB com mensagem acionável', () => {
    expect(captureMultipartSizeIssue(20 * 1024 * 1024, [
      15 * 1024 * 1024,
      15 * 1024 * 1024,
      1,
    ])).toEqual({
      code: 'CAPTURE_TOO_LARGE',
      message: 'O conjunto de áudio e imagens deve ter no máximo 50 MB. Reduza ou divida o envio.',
    });
    expect(MAX_CAPTURE_MULTIPART_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe('storage best-effort da captura', () => {
  it('preserva todos os documentos como FAILED quando a configuração do storage falha', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await prepareDocumentStorage(
      [document(1), document(2)],
      () => { throw new Error('credenciais ausentes'); },
    );

    expect(result.prepared).toEqual([
      expect.objectContaining({ stored: null, storageStatus: 'FAILED' }),
      expect.objectContaining({ stored: null, storageStatus: 'FAILED' }),
    ]);
    expect(result.warnings.map((warning) => warning.documentOrdinal)).toEqual([1, 2]);
    expect(result.warnings.every((warning) => warning.code === 'STORAGE_FAILED')).toBe(true);
  });

  it('transforma falha de upload em aviso sem rejeitar o processamento', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await prepareDocumentStorage([document(1)], () => ({
      kind: 'RAILWAY_BUCKET',
      upload: async () => { throw new Error('bucket indisponível'); },
      open: async () => { throw new Error('não usado'); },
      delete: async () => undefined,
    }));

    expect(result.prepared[0]).toMatchObject({
      stored: null,
      storageProvider: 'RAILWAY_BUCKET',
      storageStatus: 'FAILED',
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'STORAGE_FAILED', documentOrdinal: 1 }),
    ]);
  });

  it('faz um upload independente para cada foto mesmo quando o hash é igual', async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({ fileId: 'foto-1.jpg' })
      .mockResolvedValueOnce({ fileId: 'foto-2.jpg' });
    const result = await prepareDocumentStorage([document(1), document(2)], () => ({
      kind: 'LOCAL',
      upload,
      open: async () => { throw new Error('não usado'); },
      delete: async () => undefined,
    }));

    expect(upload).toHaveBeenCalledTimes(2);
    expect(result.prepared.map((item) => item.stored?.fileId)).toEqual(['foto-1.jpg', 'foto-2.jpg']);
    expect(result.warnings).toEqual([]);
  });
});
