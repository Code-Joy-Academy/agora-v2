
/**
 * Agora v2 — Gemini LLM Adapter
 * =================================
 *
 * This adapter is responsible ONLY for translating Agora's
 * provider-neutral LlmAdapter interface into Google's Gemini API.
 *
 * IMPORTANT ARCHITECTURAL RULE:
 *
 * The rest of Agora must NOT depend directly on Gemini.
 *
 * The dependency direction is:
 *
 *   Engine
 *      ↓
 *   LlmAdapter
 *      ↓
 *   GeminiAdapter
 *      ↓
 *   @google/genai
 *
 * The same interface is implemented by ClaudeAdapter.
 *
 *
 * PROVIDER SELECTION
 * ------------------
 *
 * Gemini is selected through:
 *
 *   LLM_PROVIDER=gemini
 *
 * The model is selected through:
 *
 *   LLM_MODEL=gemini-3.7-flash
 *
 * The API key is supplied through:
 *
 *   GEMINI_API_KEY=...
 *
 *
 * WHY THE API KEY IS INITIALIZED IN THE CONSTRUCTOR
 * --------------------------------------------------
 *
 * DO NOT validate GEMINI_API_KEY at module scope.
 *
 * Bad:
 *
 *   const apiKey = process.env.GEMINI_API_KEY;
 *
 *   if (!apiKey) {
 *     throw new Error(...);
 *   }
 *
 * This would execute whenever gemini.ts is imported, even if
 * Agora is configured to use Claude.
 *
 * Agora v2 uses lazy provider imports:
 *
 *   LLM_PROVIDER=gemini
 *          ↓
 *   createLlmAdapter()
 *          ↓
 *   import('./gemini.js')
 *          ↓
 *   new GeminiAdapter(llmConfig)
 *
 * Therefore the Gemini key is validated only when Gemini
 * is actually selected.
 *
 *
 * CONFIGURATION
 * -------------
 *
 * The adapter receives the resolved LlmConfig from the
 * provider factory.
 *
 * This keeps provider/model selection centralized while
 * allowing each provider to validate its own credentials.
 */

import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from '@google/genai';

import type {
  LlmAdapter,
  LlmConfig,
  EvalContext,
  ScaffoldContext,
  ExploratoryContext,
} from './adapter.js';

import {
  buildEvaluationPrompt,
  buildScaffoldPrompt,
  buildExploratoryPrompt,
} from './prompts.js';

import type {
  TurnEvaluation,
  ScaffoldResponse,
} from '../types.js';

/**
 * Gemini response validation.
 *
 * The evaluation endpoint is required to return exactly the
 * semantic fields Agora needs for deterministic mastery logic.
 *
 * The LLM does NOT calculate mastery.
 *
 * It only reports:
 *
 *   is_correct
 *   matched_misconception
 *   feedback_signal
 *
 * The mastery engine then consumes these values.
 */
function parseTurnEvaluation(
  text: string,
): TurnEvaluation {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Gemini returned invalid JSON for TurnEvaluation: ${text}`,
      {
        cause: error,
      },
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('is_correct' in parsed) ||
    !('matched_misconception' in parsed) ||
    !('feedback_signal' in parsed)
  ) {
    throw new Error(
      `Gemini returned an invalid TurnEvaluation shape: ${text}`,
    );
  }

  const evaluation = parsed as {
    is_correct: unknown;
    matched_misconception: unknown;
    feedback_signal: unknown;
  };

  if (
    typeof evaluation.is_correct !== 'boolean'
  ) {
    throw new Error(
      'TurnEvaluation.is_correct must be a boolean',
    );
  }

  if (
    evaluation.matched_misconception !== null &&
    typeof evaluation.matched_misconception !== 'string'
  ) {
    throw new Error(
      'TurnEvaluation.matched_misconception must be a string or null',
    );
  }

  if (
    typeof evaluation.feedback_signal !== 'string'
  ) {
    throw new Error(
      'TurnEvaluation.feedback_signal must be a string',
    );
  }

  return {
    is_correct: evaluation.is_correct,

    matched_misconception:
      evaluation.matched_misconception,

    feedback_signal:
      evaluation.feedback_signal,
  };
}

/**
 * Extract non-empty text from a Gemini response.
 *
 * All three Gemini operations use this helper so that an
 * empty model response becomes an explicit application error
 * rather than propagating undefined/empty content.
 */
function extractText(
  response: { text?: string },
): string {
  const text = response.text?.trim();

  if (!text) {
    throw new Error(
      'Gemini returned an empty response',
    );
  }

  return text;
}

/**
 * Gemini implementation of Agora's provider-neutral
 * LlmAdapter interface.
 */
export class GeminiAdapter implements LlmAdapter {
  /**
   * Gemini API client.
   *
   * Initialized in the constructor rather than at module scope.
   */
  private readonly ai: GoogleGenAI;

  /**
   * Model selected by Agora's LlmConfig.
   *
   * Example:
   *
   *   gemini-3.7-flash
   */
  private readonly modelName: string;

  /**
   * Construct a Gemini adapter using Agora's resolved
   * provider/model configuration.
   *
   * Credential validation happens here, not during module
   * import.
   */
  constructor(config: LlmConfig) {
    const apiKey =
      process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to backend/.env.',
      );
    }

    /*
     * Initialize the Gemini SDK only after the provider
     * has actually been selected.
     */
    this.ai = new GoogleGenAI({
      apiKey,
    });

    /*
     * The model comes from LlmConfig rather than directly
     * from process.env.
     *
     * This means:
     *
     *   config.ts
     *       ↓
     *   LlmConfig
     *       ↓
     *   GeminiAdapter
     */
    this.modelName = config.model;
  }

  /**
   * Evaluate a student's response.
   *
   * Gemini is responsible for pedagogical classification.
   *
   * It is NOT responsible for updating mastery.
   *
   * Flow:
   *
   *   student attempt
   *        ↓
   *   evaluation prompt
   *        ↓
   *   Gemini
   *        ↓
   *   TurnEvaluation
   *        ↓
   *   masteryEngine.applyTurn()
   */
  async evaluateTurn(
    ctx: EvalContext,
  ): Promise<TurnEvaluation> {
    const response =
      await this.ai.models.generateContent({
        model: this.modelName,

        contents:
          buildEvaluationPrompt(ctx),

        config: {
          /*
           * Force Gemini to produce machine-readable JSON.
           */
          responseMimeType:
            'application/json',

          /*
           * Explicit schema keeps the provider response
           * aligned with TurnEvaluation.
           */
          responseSchema: {
            type: Type.OBJECT,

            properties: {
              is_correct: {
                type: Type.BOOLEAN,

                description:
                  'Whether the student response is correct.',
              },

              matched_misconception: {
                type: Type.STRING,

                nullable: true,

                description:
                  'The matching known misconception verbatim, or null.',
              },

              feedback_signal: {
                type: Type.STRING,

                description:
                  'A short internal note describing what the student got right or missed.',
              },
            },

            required: [
              'is_correct',
              'matched_misconception',
              'feedback_signal',
            ],
          },
        },
      });

    return parseTurnEvaluation(
      extractText(response),
    );
  }

  /**
   * Generate the next scaffold.
   *
   * The deterministic mastery engine has already selected
   * the scaffold level before this method is called.
   *
   * Gemini therefore does NOT decide:
   *
   *   "Should this be level 1 or level 3?"
   *
   * Instead it receives:
   *
   *   scaffoldLevel
   *   pedagogyDirectness
   *
   * and turns those constraints into natural language.
   *
   * This separation is important because scaffold selection
   * remains deterministic and testable.
   */
  async generateScaffold(
    ctx: ScaffoldContext,
  ): Promise<ScaffoldResponse> {
    const response =
      await this.ai.models.generateContent({
        model: this.modelName,

        contents:
          buildScaffoldPrompt(ctx),

        config: {
          /*
           * Scaffold generation benefits from some reasoning,
           * but we deliberately keep it low to reduce latency
           * for an interactive tutoring turn.
           */
          thinkingConfig: {
            thinkingLevel:
              ThinkingLevel.LOW,
          },
        },
      });

    return {
      /*
       * Preserve the deterministic scaffold level selected
       * by masteryEngine.applyTurn().
       */
      scaffold_level:
        ctx.scaffoldLevel,

      /*
       * Gemini supplies only the student-facing message.
       */
      message:
        extractText(response),
    };
  }

  /**
   * Generate an answer for exploratory mode.
   *
   * Exploratory mode differs from guided Socratic mode:
   *
   *   - no mastery mutation
   *   - no scaffold level
   *   - no friction escalation
   *
   * The adapter receives retrieved resources and the optional
   * curriculum node and synthesizes an answer.
   */
  async generateExploratoryAnswer(
    ctx: ExploratoryContext,
  ): Promise<string> {
    const response =
      await this.ai.models.generateContent({
        model: this.modelName,

        contents:
          buildExploratoryPrompt(ctx),
      });

    return extractText(response);
  }
}

