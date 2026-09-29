/**
 * Agora v2 — Groq LLM Adapter
 * =============================
 *
 * Provider adapter for Groq's OpenAI-compatible API.
 *
 * Agora itself remains provider-neutral:
 *
 *   Engine
 *      ↓
 *   LlmAdapter
 *      ↓
 *   GroqAdapter
 *      ↓
 *   OpenAI SDK → Groq API
 *
 * PROVIDER SELECTION
 * ------------------
 *
 *   LLM_PROVIDER=groq
 *
 * MODEL:
 *
 *   LLM_MODEL=openai/gpt-oss-120b
 *
 * API KEY:
 *
 *   GROQ_API_KEY=...
 *
 * The API key is intentionally validated inside the
 * constructor so importing this module does not require
 * Groq credentials when another provider is selected.
 */

import OpenAI from 'openai';

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
 * Parse and validate Groq's TurnEvaluation response.
 *
 * The provider is responsible only for classification.
 * Mastery remains deterministic inside Agora.
 */
function parseTurnEvaluation(
  text: string,
): TurnEvaluation {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Groq returned invalid JSON for TurnEvaluation: ${text}`,
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
      `Groq returned an invalid TurnEvaluation shape: ${text}`,
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
 * Extract non-empty text from a Groq/OpenAI-compatible
 * chat completion response.
 */
function extractText(
  content: string | null | undefined,
): string {
  const text = content?.trim();

  if (!text) {
    throw new Error(
      'Groq returned an empty response',
    );
  }

  return text;
}

/**
 * Groq implementation of Agora's provider-neutral
 * LlmAdapter interface.
 */
export class GroqAdapter implements LlmAdapter {
  /**
   * OpenAI-compatible client configured for Groq.
   */
  private readonly client: OpenAI;

  /**
   * Model selected by Agora's LlmConfig.
   *
   * Example:
   *
   *   openai/gpt-oss-120b
   */
  private readonly modelName: string;

  /**
   * Construct the Groq adapter.
   *
   * Credential validation happens here rather than at
   * module scope.
   */
  constructor(config: LlmConfig) {
    const apiKey =
      process.env.GROQ_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY is not set. Add it to backend/.env.',
      );
    }

    /*
     * Groq implements the OpenAI-compatible API.
     */
    this.client = new OpenAI({
      apiKey,

      baseURL:
        'https://api.groq.com/openai/v1',
    });

    this.modelName = config.model;
  }

  /**
   * Evaluate a student's response.
   *
   * Groq performs the same semantic classification as
   * Gemini. It does NOT calculate mastery.
   */
  async evaluateTurn(
    ctx: EvalContext,
  ): Promise<TurnEvaluation> {
    const completion =
      await this.client.chat.completions.create({
        model: this.modelName,
  
        messages: [
          {
            role: 'system',
            content: `
  You are Agora's student-response evaluator.
  
  Your job is to classify the student's latest response.
  
  Return ONLY a valid JSON object.
  
  The JSON must have exactly these fields:
  
  {
    "is_correct": boolean,
    "matched_misconception": string | null,
    "feedback_signal": string
  }
  
  Rules:
  
  1. "is_correct" must be true or false.
  2. "matched_misconception" must contain the matching known
     misconception verbatim, or null if none matches.
  3. "feedback_signal" must be a short internal description
     of what the student understood or misunderstood.
  4. Do not provide the student with the answer.
  5. Do not use Markdown.
  6. Do not wrap the JSON in a code fence.
  7. Do not include any text before or after the JSON.
            `.trim(),
          },
  
          {
            role: 'user',
            content:
              buildEvaluationPrompt(ctx),
          },
        ],
  
        response_format: {
          type: 'json_object',
        },
      });
  
    const content =
      completion.choices[0]?.message?.content;
  
    return parseTurnEvaluation(
      extractText(content),
    );
  }
  
  /**
   * Generate the next scaffold.
   *
   * Agora's deterministic mastery engine has already
   * selected the scaffold level.
   *
   * Groq only converts those constraints into
   * student-facing language.
   */
  async generateScaffold(
    ctx: ScaffoldContext,
  ): Promise<ScaffoldResponse> {
    const completion =
      await this.client.chat.completions.create({
        model: this.modelName,

        messages: [
          {
            role: 'user',
            content:
              buildScaffoldPrompt(ctx),
          },
        ],
      });

    const content =
      completion.choices[0]?.message?.content;

    return {
      /*
       * Preserve Agora's deterministic scaffold level.
       */
      scaffold_level:
        ctx.scaffoldLevel,

      /*
       * Groq supplies only the student-facing message.
       */
      message:
        extractText(content),
    };
  }

  /**
   * Generate an answer for exploratory mode.
   *
   * No mastery mutation occurs here.
   */
  async generateExploratoryAnswer(
    ctx: ExploratoryContext,
  ): Promise<string> {
    const completion =
      await this.client.chat.completions.create({
        model: this.modelName,

        messages: [
          {
            role: 'user',
            content:
              buildExploratoryPrompt(ctx),
          },
        ],
      });

    return extractText(
      completion.choices[0]?.message?.content,
    );
  }
}