import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LlmInterpretationError,
  LlmRequestError,
  OpenRouterProvider,
} from '../../src/server/services/llm';

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

describe('OpenRouterProvider.interpret', () => {
  it('refaz uma interpretação que veio fora do contrato e usa a resposta corrigida', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: '{"registros":[]}' } }],
        usage: { total_tokens: 120 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { content: '{"intents":[{"type":"unknown","reason":"Revisar a leitura"}]}' },
        }],
        usage: { total_tokens: 80 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().interpret('Três fotos de controle individual')).resolves.toMatchObject({
      intents: [{ type: 'unknown', reason: 'Revisar a leitura' }],
      tokensUsed: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.max_completion_tokens).toBe(16_000);
    expect(repairBody.max_completion_tokens).toBe(16_000);
    expect(firstBody.reasoning).toEqual({ effort: 'minimal', exclude: true });
    expect(repairBody.messages.at(-1).content).toContain('Corrija a resposta anterior');
  });

  it('expõe somente diagnósticos estruturais quando as duas respostas são inválidas', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '{"intents":[' } }],
        usage: { total_tokens: 4000 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: '{"intents":[]}' } }],
        usage: { total_tokens: 30 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const failure = await provider().interpret('conteúdo sensível da fazenda').catch((error) => error);

    expect(failure).toBeInstanceOf(LlmInterpretationError);
    expect(failure).toMatchObject({
      code: 'INTERPRET_INVALID',
      status: 502,
      diagnostics: {
        attempts: [
          expect.objectContaining({ failureKind: 'INVALID_JSON', finishReason: 'length' }),
          expect.objectContaining({ failureKind: 'INVALID_SCHEMA', finishReason: 'stop' }),
        ],
      },
    });
    expect(JSON.stringify(failure.diagnostics)).not.toContain('conteúdo sensível');
  });

  it('converte falha de rede em erro sanitizado que permite o fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('token secreto na falha de rede')));

    const failure = await provider().interpret('conteúdo sensível da fazenda').catch((error) => error);

    expect(failure).toBeInstanceOf(LlmRequestError);
    expect(failure).toMatchObject({
      code: 'LLM_FAILED',
      message: 'O serviço de leitura automática está indisponível agora. Tente novamente.',
      diagnostics: {
        model: 'google/gemini-test',
        phase: 'interpret_initial',
        failureKind: 'NETWORK',
        providerStatus: null,
      },
    });
    expect(JSON.stringify(failure)).not.toContain('token secreto');
  });

  it('classifica resposta não-JSON do provedor sem vazar seu corpo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('<html>detalhe externo sensível</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    ));

    const failure = await provider().interpret('leitura').catch((error) => error);

    expect(failure).toMatchObject({
      code: 'LLM_FAILED',
      diagnostics: {
        phase: 'interpret_initial',
        failureKind: 'INVALID_PROVIDER_RESPONSE',
        providerStatus: 502,
      },
    });
    expect(JSON.stringify(failure)).not.toContain('detalhe externo');
  });
});
