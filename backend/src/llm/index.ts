import type { LlmAdapter } from './adapter.js';
import { createLlmAdapter } from './create-adapter.js';

/**
 * Provider-neutral Agora LLM.
 *
 * The provider is selected through:
 *
 *   LLM_PROVIDER=gemini
 *
 * or:
 *
 *   LLM_PROVIDER=claude
 */
export const llm: LlmAdapter = await createLlmAdapter();
