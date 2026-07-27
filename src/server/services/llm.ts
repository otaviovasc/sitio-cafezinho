import { Buffer } from 'node:buffer';
import { env } from '../env.js';
import { ApiError } from '../http/api-error.js';
import { stripMarkdownJson } from '../../domain/import.js';
import { interpretationSchema, type VoiceIntent } from '../../domain/nl/intents.js';
import { buildInterpretSystemPrompt, type InterpretContext } from '../../domain/nl/prompts.js';

/**
 * Fronteira única com o modelo (OpenRouter). É o único ponto impuro da camada
 * de linguagem natural: tudo mais (intents, resolve) é determinístico e testável
 * sem rede. Sem OPENROUTER_API_KEY, o provider fica desativado e os endpoints de
 * captura respondem 503 — é assim que a primeira iteração roda sem chave.
 */

export class LlmDisabledError extends ApiError {
  constructor() {
    super('A captura por linguagem natural está desativada (defina OPENROUTER_API_KEY).', 503, 'VOICE_DISABLED');
  }
}

export type BinaryInput = { buffer: Buffer; filename: string; mimeType: string; durationSeconds?: number };
export type TranscribeResult = { text: string; raw: unknown; model: string };
export type OcrResult = { text: string; raw: unknown; model: string };
export type InterpretResult = { intents: VoiceIntent[]; raw: unknown; model: string; tokensUsed: number | null };

export interface LlmProvider {
  readonly enabled: boolean;
  transcribe(audio: BinaryInput): Promise<TranscribeResult>;
  ocr(document: BinaryInput, hint?: string): Promise<OcrResult>;
  interpret(transcript: string, context?: InterpretContext): Promise<InterpretResult>;
}

type ChatResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { total_tokens?: unknown };
  error?: { message?: unknown };
};

function describeError(raw: unknown): string {
  const message = (raw as ChatResponse | null)?.error?.message;
  return typeof message === 'string' ? message : 'erro desconhecido';
}

function messageContent(raw: unknown): string {
  const content = (raw as ChatResponse | null)?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

class DisabledProvider implements LlmProvider {
  readonly enabled = false;
  transcribe(): Promise<TranscribeResult> { throw new LlmDisabledError(); }
  ocr(): Promise<OcrResult> { throw new LlmDisabledError(); }
  interpret(): Promise<InterpretResult> { throw new LlmDisabledError(); }
}

type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  sttModel: string;
  sttFallbackModel: string;
  intentModel: string;
  appUrl: string;
};

type TranscriptionResponse = {
  response: Response;
  raw: unknown;
  model: string;
};

export class OpenRouterProvider implements LlmProvider {
  readonly enabled = true;
  constructor(private readonly config: OpenRouterConfig) {}

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': this.config.appUrl,
      'X-Title': 'Sítio Cafezinho',
      ...extra,
    };
  }

  private async requestTranscription(audio: BinaryInput, model: string): Promise<TranscriptionResponse> {
    const form = new FormData();
    form.append('model', model);
    form.append('language', 'pt');
    form.append('file', new Blob([audio.buffer], { type: audio.mimeType }), audio.filename);
    const response = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
      method: 'POST', headers: this.headers(), body: form,
    });
    const raw = await response.json();
    return { response, raw, model };
  }

  async transcribe(audio: BinaryInput): Promise<TranscribeResult> {
    const longRecording = typeof audio.durationSeconds === 'number' && audio.durationSeconds >= 45;
    const firstModel = longRecording ? this.config.sttFallbackModel : this.config.sttModel;
    const secondModel = longRecording ? this.config.sttModel : this.config.sttFallbackModel;
    const primary = await this.requestTranscription(audio, firstModel);
    let result = primary;

    const shouldFallback = !primary.response.ok
      && secondModel !== firstModel
      && (
        primary.response.status === 400
        || primary.response.status === 404
        || primary.response.status === 408
        || primary.response.status === 429
        || primary.response.status >= 500
    );
    if (shouldFallback) {
      result = await this.requestTranscription(audio, secondModel);
    }

    if (!result.response.ok) {
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'stt_failed',
        firstModel: primary.model,
        firstStatus: primary.response.status,
        firstMessage: describeError(primary.raw),
        secondModel: result === primary ? null : result.model,
        secondStatus: result === primary ? null : result.response.status,
        secondMessage: result === primary ? null : describeError(result.raw),
      }));
      throw new ApiError('Não foi possível transcrever o áudio agora. Tente novamente.', 502, 'STT_FAILED');
    }

    const text = typeof (result.raw as { text?: unknown }).text === 'string'
      ? ((result.raw as { text: string }).text).trim()
      : '';
    return { text, raw: result.raw, model: result.model };
  }

  async ocr(document: BinaryInput, hint?: string): Promise<OcrResult> {
    const dataUri = `data:${document.mimeType};base64,${document.buffer.toString('base64')}`;
    const instruction = hint
      ? `Contexto informado: ${hint}\n\nTranscreva fielmente o conteúdo deste documento em texto simples, sem inventar dados.`
      : 'Transcreva fielmente o conteúdo deste documento em texto simples, sem inventar dados.';
    const raw = await this.chat([{
      role: 'user',
      content: [
        { type: 'text', text: instruction },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    }]);
    return { text: messageContent(raw).trim(), raw, model: this.config.intentModel };
  }

  async interpret(transcript: string, context: InterpretContext = {}): Promise<InterpretResult> {
    const raw = await this.chat(
      [
        { role: 'system', content: buildInterpretSystemPrompt(context) },
        { role: 'user', content: transcript },
      ],
      { type: 'json_object' },
    );
    const json = safeParseJson(messageContent(raw));
    const parsed = interpretationSchema.safeParse(json);
    if (!parsed.success) throw new ApiError('O modelo devolveu uma interpretação fora do formato esperado.', 502, 'INTERPRET_INVALID');
    const totalTokens = (raw as ChatResponse).usage?.total_tokens;
    return {
      intents: parsed.data.intents,
      raw,
      model: this.config.intentModel,
      tokensUsed: typeof totalTokens === 'number' ? totalTokens : null,
    };
  }

  private async chat(messages: unknown[], responseFormat?: { type: string }): Promise<unknown> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: this.config.intentModel,
        messages,
        temperature: 0,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });
    const raw = await response.json();
    if (!response.ok) throw new ApiError(`Falha no modelo: ${describeError(raw)}`, 502, 'LLM_FAILED');
    return raw;
  }
}

function safeParseJson(content: string): unknown {
  try {
    return JSON.parse(stripMarkdownJson(content));
  } catch {
    return null;
  }
}

let cached: LlmProvider | undefined;

export function getLlmProvider(): LlmProvider {
  if (!cached) {
    const config = env();
    cached = config.OPENROUTER_API_KEY
      ? new OpenRouterProvider({
        apiKey: config.OPENROUTER_API_KEY,
        baseUrl: config.OPENROUTER_BASE_URL,
        sttModel: config.OPENROUTER_STT_MODEL,
        sttFallbackModel: config.OPENROUTER_STT_FALLBACK_MODEL,
        intentModel: config.OPENROUTER_INTENT_MODEL,
        appUrl: config.PUBLIC_APP_URL,
      })
      : new DisabledProvider();
  }
  return cached;
}
