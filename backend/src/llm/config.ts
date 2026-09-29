import type {
  LlmConfig,
  LlmProvider,
} from './adapter.js';

/**
 * Default models for each supported provider.
 *
 * These are fallbacks only.
 * Set LLM_MODEL explicitly in production or when running
 * controlled model evaluations.
 */
const defaultModels: Record<LlmProvider, string> = {
  gemini: 'gemini-3.7-flash',
  claude: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
  groq: 'openai/gpt-oss-120b',
};

/**
 * Read and validate LLM_PROVIDER from the environment.
 */
function getProvider(): LlmProvider {
  const value =
    process.env.LLM_PROVIDER?.trim() || 'gemini';

  const supportedProviders: LlmProvider[] = [
    'gemini',
    'claude',
    'openai',
    'groq',
  ];

  if (
    !supportedProviders.includes(
      value as LlmProvider,
    )
  ) {
    throw new Error(
      `Invalid LLM_PROVIDER "${value}". ` +
        `Expected one of: ${supportedProviders.join(', ')}.`,
    );
  }

  return value as LlmProvider;
}

/**
 * Load the provider/model configuration used by Agora v2.
 */
export function getLlmConfig(): LlmConfig {
  const provider = getProvider();

  const model =
    process.env.LLM_MODEL?.trim() ||
    defaultModels[provider];

  return {
    provider,
    model,
  };
}

/**
 * Resolved LLM configuration.
 *
 * This is evaluated once when the application imports
 * the module.
 */
export const llmConfig = getLlmConfig();