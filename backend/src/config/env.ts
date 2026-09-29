import 'dotenv/config';

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',

  port: Number(process.env.PORT ?? 4000),

  agoraBaseUrl:
    process.env.AGORA_BASE_URL ??
    'http://localhost:4000',

  corsOrigins:
    process.env.CORS_ORIGINS ??
    'http://localhost:3000, http://localhost:5173',

  enableMockPlatform:
    process.env.ENABLE_MOCK_PLATFORM === 'true',

  databaseUrl:
    process.env.DATABASE_URL ?? '',

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