
import Anthropic from '@anthropic-ai/sdk';

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

function extractText(
  response: Anthropic.Message,
): string {
  const block = response.content.find(
    (item) => item.type === 'text',
  );

  if (!block || block.type !== 'text') {
    throw new Error(
      'Claude returned an empty response',
    );
  }

  const text = block.text.trim();

  if (!text) {
    throw new Error(
      'Claude returned an empty response',
    );
  }

  return text;
}

function parseTurnEvaluation(
  text: string,
): TurnEvaluation {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Claude returned invalid JSON for TurnEvaluation: ${text}`,
      { cause: error },
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
      `Claude returned an invalid TurnEvaluation shape: ${text}`,
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

export class ClaudeAdapter implements LlmAdapter {
  private readonly client: Anthropic;
  private readonly modelName: string;

  constructor(config: LlmConfig) {
    const apiKey =
      process.env.ANTHROPIC_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Add it to backend/.env.',
      );
    }

    this.client = new Anthropic({
      apiKey,
    });

    this.modelName = config.model;
  }

  async evaluateTurn(
    ctx: EvalContext,
  ): Promise<TurnEvaluation> {
    const response =
      await this.client.messages.create({
        model: this.modelName,
        max_tokens: 800,

        messages: [
          {
            role: 'user',
            content:
              buildEvaluationPrompt(ctx),
          },
        ],
      });

    return parseTurnEvaluation(
      extractText(response),
    );
  }

  async generateScaffold(
    ctx: ScaffoldContext,
  ): Promise<ScaffoldResponse> {
    const response =
      await this.client.messages.create({
        model: this.modelName,
        max_tokens: 400,

        messages: [
          {
            role: 'user',
            content:
              buildScaffoldPrompt(ctx),
          },
        ],
      });

    return {
      scaffold_level:
        ctx.scaffoldLevel,
      message:
        extractText(response),
    };
  }

  async generateExploratoryAnswer(
    ctx: ExploratoryContext,
  ): Promise<string> {
    const response =
      await this.client.messages.create({
        model: this.modelName,
        max_tokens: 800,

        messages: [
          {
            role: 'user',
            content:
              buildExploratoryPrompt(ctx),
          },
        ],
      });

    return extractText(response);
  }
}

