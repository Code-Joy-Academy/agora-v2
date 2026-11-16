import 'dotenv/config';

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',

  port: Number(process.env.PORT ?? 4000),

  agoraBaseUrl: (process.env.AGORA_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),

  corsOrigins:
      process.env.CORS_ORIGINS ??
      'http://localhost:3000, http://localhost:5173',

  enableMockPlatform:
      process.env.ENABLE_MOCK_PLATFORM === 'true',

  databaseUrl:
      process.env.DATABASE_URL ?? '',

  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'Agora <login@your-domain.example>',
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax')) as 'lax' | 'strict' | 'none',
  sessionCookieSecure: process.env.SESSION_COOKIE_SECURE !== 'false',

  llmProvider:
      process.env.LLM_PROVIDER ?? 'groq',

  llmModel:
      process.env.LLM_MODEL ??
      'openai/gpt-oss-120b',

  groqApiKey:
      process.env.GROQ_API_KEY ?? '',

  llmTimeoutMs:
      Number(process.env.LLM_TIMEOUT_MS ?? 15000),

  llmMaxRetries:
      Number(process.env.LLM_MAX_RETRIES ?? 2),
};