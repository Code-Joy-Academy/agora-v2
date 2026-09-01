import type { LlmAdapter } from './adapter.js';
import { llmConfig } from './config.js';

/**
 * Create the configured LLM adapter.
 *
 * Provider modules are loaded lazily so that Agora does NOT
 * require credentials for providers that are not being used.
 *
 * Example:
 *
 *   LLM_PROVIDER=gemini
 *   GEMINI_API_KEY=...
 *
 * will load gemini.ts only.
 *
 * It will NOT load claude.ts, so ANTHROPIC_API_KEY is irrelevant.
 */
export async function createLlmAdapter(): Promise<LlmAdapter> {
  switch (llmConfig.provider) {
    case 'gemini': {
      const { GeminiAdapter } = await import('./gemini.js');

      return new GeminiAdapter(llmConfig);
    }

    case 'claude': {
      const { ClaudeAdapter } = await import('./claude.js');

      return new ClaudeAdapter(llmConfig);
    }

    case 'openai':
      throw new Error(
        'OpenAI adapter is configured but not implemented yet.',
      );

    default:
      throw new Error(
        `Unsupported LLM provider: ${llmConfig.provider}`,
      );
  }
}

