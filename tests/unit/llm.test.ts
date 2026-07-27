import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '../../src/server/services/llm';

const audio = {
  buffer: Buffer.from('audio'),
  filename: 'captura.mp4',
  mimeType: 'audio/mp4',
};

function provider() {
  return new OpenRouterProvider({
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1',
    sttModel: 'google/chirp-3',
    sttFallbackModel: 'openai/gpt-4o-mini-transcribe',
    intentModel: 'google/gemini-test',
    appUrl: 'https://sitio.test',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OpenRouterProvider.transcribe', () => {
  it('envia gravações longas direto ao modelo alternativo', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      text: 'registro longo transcrito',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().transcribe({ ...audio, durationSeconds: 55 })).resolves.toMatchObject({
      text: 'registro longo transcrito',
      model: 'openai/gpt-4o-mini-transcribe',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('model')).toBe('openai/gpt-4o-mini-transcribe');
  });

  it('usa o modelo alternativo quando o provider principal rejeita a captura', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 400, message: 'Provider returned error' },
      }), { status: 400, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: 'registro longo transcrito',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().transcribe(audio)).resolves.toMatchObject({
      text: 'registro longo transcrito',
      model: 'openai/gpt-4o-mini-transcribe',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    const fallbackBody = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect(firstBody.get('model')).toBe('google/chirp-3');
    expect(fallbackBody.get('model')).toBe('openai/gpt-4o-mini-transcribe');
  });

  it('devolve erro acionável e registra os modelos quando ambos falham', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 400, message: 'audio exceeds 60 seconds' },
      }), { status: 400, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 503, message: 'Provider unavailable' },
      }), { status: 503, headers: { 'content-type': 'application/json' } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().transcribe(audio)).rejects.toMatchObject({
      status: 502,
      code: 'STT_FAILED',
      message: 'Não foi possível transcrever o áudio agora. Tente novamente.',
    });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('"firstModel":"google/chirp-3"');
    expect(warn.mock.calls[0]?.[0]).toContain('"secondModel":"openai/gpt-4o-mini-transcribe"');
  });
});
