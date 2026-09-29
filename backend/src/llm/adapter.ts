
import type {
  CurriculumNode,
  TurnEvaluation,
  ScaffoldResponse,
} from '../types.js';

import type { RetrievedResource } from '../retrieval/retrieval.js';

/**
 * Supported LLM providers in Agora v2.
 *
 * Add a provider here only when a corresponding adapter has been implemented.
 */
export type LlmProvider =
  | 'gemini'
  | 'claude'
  | 'openai'
  | 'groq';
  
/**
 * Runtime configuration for the LLM layer.
 *
 * LLM_PROVIDER controls which adapter Agora uses.
 * LLM_MODEL controls the specific model used by that adapter.
 *
 * Example:
 *
 *   LLM_PROVIDER=gemini
 *   LLM_MODEL=gemini-3.7-flash
 *
 * or:
 *
 *   LLM_PROVIDER=claude
 *   LLM_MODEL=claude-haiku-4-5
 */
export interface LlmConfig {
  provider: LlmProvider;
  model: string;
}

/**
 * Context supplied to the LLM when evaluating a student's answer.
 *
 * This deliberately contains curriculum, misconception, and retrieval
 * information so that every provider receives the same pedagogical context.
 */
export interface EvalContext {
  /** The curriculum node currently being taught. */
  node: CurriculumNode;

  /** The question presented to the student. */
  question: string;

  /** The student's latest attempt. */
  studentAttempt: string;

  /**
   * Known misconceptions associated with the curriculum node.
   *
   * If the student's response matches one of these, the LLM should
   * identify it verbatim.
   */
  misconceptionTriggers: string[];

  /**
   * Retrieved curriculum/support resources relevant to this turn.
   *
   * These are supplied by Agora's retrieval layer rather than selected
   * by the LLM provider.
   */
  resources: RetrievedResource[];
}

/**
 * Context supplied when generating a scaffold/hint.
 *
 * Extends EvalContext so the scaffold generator has the complete
 * curriculum + retrieval + student context.
 */
export interface ScaffoldContext extends EvalContext {
  /** Result of the current evaluation step. */
  evaluation: TurnEvaluation;

  /**
   * Current scaffold level.
   *
   * 0 = open Socratic question
   * 1 = targeted nudge
   * 2 = micro-question
   * 3 = analogous worked technique
   * 4 = confidence-building next step after repeated difficulty
   */
  scaffoldLevel: 0 | 1 | 2 | 3 | 4;

  /**
   * Teacher-controlled pedagogy setting.
   *
   * 0 = maximally Socratic
   * 1 = maximally direct
   */
  pedagogyDirectness: number;
}

/**
 * Context supplied when a student asks an exploratory question
 * outside the current guided question flow.
 */
export interface ExploratoryContext {
  /** Current curriculum node, if the student is working within one. */
  node: CurriculumNode | null;

  /** The student's free-form question. */
  studentQuery: string;

  /** Retrieved resources relevant to the question. */
  resources: RetrievedResource[];
}

/**
 * Provider-neutral interface for Agora's LLM layer.
 *
 * The rest of the application should depend on this interface rather
 * than directly importing Gemini, Claude, or OpenAI SDKs.
 */
export interface LlmAdapter {
  /**
   * Evaluate a student's attempt without giving them the answer.
   */
  evaluateTurn(ctx: EvalContext): Promise<TurnEvaluation>;

  /**
   * Generate the next pedagogically appropriate scaffold.
   */
  generateScaffold(ctx: ScaffoldContext): Promise<ScaffoldResponse>;

  /**
   * Answer an exploratory student question while respecting
   * Agora's tutoring principles.
   */
  generateExploratoryAnswer(ctx: ExploratoryContext): Promise<string>;
}

