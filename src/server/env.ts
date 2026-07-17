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
  STORAGE_MODE: z.enum(['local', 'google_drive']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('/data/uploads'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REFRESH_TOKEN: z.string().optional().default(''),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional().default(''),
  // Camada de linguagem natural (áudio/documento/texto → ação). Opcional:
  // sem chave, os endpoints de captura respondem 503 e a UI de voz fica oculta.
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  // Transcrição pt-BR: Chirp 3 (STT dedicado do Google). Interpretação/JSON: Gemini 3.1 Flash Lite.
  OPENROUTER_STT_MODEL: z.string().default('google/chirp-3'),
  OPENROUTER_INTENT_MODEL: z.string().default('google/gemini-3.1-flash-lite'),
}).superRefine((value, context) => {
  if (value.STORAGE_MODE === 'google_drive') {
    for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID'] as const) {
      if (!value[key]) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} é obrigatória no modo google_drive.` });
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
