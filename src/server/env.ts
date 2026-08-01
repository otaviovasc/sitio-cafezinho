import process from 'node:process';
import { z } from 'zod';

try {
  if (process.env.NODE_ENV !== 'production') process.loadEnvFile?.('.env');
} catch {
  // O Docker injeta as variáveis; .env é opcional fora dele.
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL não foi configurada.'),
  APP_PASSWORD: z.string().min(8, 'APP_PASSWORD deve ter pelo menos 8 caracteres.'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve ter pelo menos 32 caracteres.'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  SEED_DEMO_DATA: z.enum(['true', 'false']).default('false'),
  STORAGE_MODE: z.enum(['local', 'railway_bucket']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('/data/uploads'),
  AWS_ENDPOINT_URL: z.union([z.literal(''), z.string().url()]).default(''),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  AWS_S3_BUCKET_NAME: z.string().optional().default(''),
  AWS_DEFAULT_REGION: z.string().optional().default('auto'),
  // Camada de linguagem natural (áudio/documento/texto → ação). Opcional:
  // sem chave, os endpoints de captura respondem 503 e a UI de voz fica oculta.
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  // Transcrição pt-BR: Chirp 3 (STT dedicado do Google). Interpretação/JSON: Gemini 3.1 Flash Lite.
  OPENROUTER_STT_MODEL: z.string().default('google/chirp-3'),
  // Áudio longo pode atingir o timeout de processamento do provider do Chirp.
  // O fallback também cobre indisponibilidade temporária do modelo principal.
  OPENROUTER_STT_FALLBACK_MODEL: z.string().default('openai/gpt-4o-mini-transcribe'),
  OPENROUTER_INTENT_MODEL: z.string().default('google/gemini-3.1-flash-lite'),
}).superRefine((value, context) => {
  if (value.STORAGE_MODE === 'railway_bucket') {
    for (const key of ['AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_DEFAULT_REGION'] as const) {
      if (!value[key]) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} é obrigatória no modo railway_bucket.` });
    }
  }
});

let cached: z.infer<typeof envSchema> | undefined;

export function env() {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new Error(`Configuração inválida: ${messages}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function resetEnvForTests() {
  cached = undefined;
}
