import type { MasteryState } from '../types.js';
import { clampHintCount } from './utils.js';

/**
 * Agora v2 mastery engine
 *
 * IMPORTANT:
 *
 * This module is deliberately deterministic and provider-independent.
 *
 * Gemini, Claude, OpenAI, etc. may evaluate a student's response,
 * but they do NOT decide:
 *
 * - mastery probability
 * - correctness counts
 * - hint counts
 * - consecutive success counts
 * - friction alerts
 * - scaffold level
 *
 * Those decisions belong to this engine.
 */

const clamp = (
  value: number,
  min: number,
  max: number,
): number =>
  Math.min(max, Math.max(min, value));

/**
 * Maximum scaffold level supported by Agora.
 */
const MAX_SCAFFOLD_LEVEL = 4;

/**
 * Mastery increase after a correct answer.
 *
 * The amount depends on how much scaffolding was required.
 *
 * No hints:
 *   +0.20
 *
 * One hint:
 *   +0.12
 *
 * Multiple hints:
 *   +0.06
 *
 * Every third consecutive success:
 *   additional +0.10
 */
const MASTERY_DELTA_NO_HINT = 0.20;
const MASTERY_DELTA_ONE_HINT = 0.12;
const MASTERY_DELTA_WITH_HINTS = 0.06;

/**
 * Mastery decrease after an incorrect answer.
 */
const MASTERY_PENALTY_INCORRECT = 0.08;

/**
 * Additional mastery reward for sustained success.
 */
const MASTERY_BONUS_EVERY_THREE_SUCCESSES = 0.10;

/**
 * Starting mastery for a student encountering a node
 * for the first time.
 */
const INITIAL_MASTERY = 0.10;

export interface TurnInput {
  /**
   * Whether the LLM evaluator judged the student's response
   * to be correct.
   */
  isCorrect: boolean;

  /**
   * Known misconception detected by the evaluator.
   *
   * Must be one of the configured misconception triggers,
   * or null.
   */
  matchedMisconception: string | null;

  /**
   * Time spent on this turn.
   */
  secondsSpent: number;

  /**
   * Teacher/course-controlled maximum number of hints
   * before friction escalation.
   */
  hintCap: number;
}

export interface TurnOutcome {
  /**
   * Updated deterministic mastery state.
   */
  state: MasteryState;

  /**
   * Scaffold level selected by the deterministic engine.
   *
   * 0 = open Socratic question
   * 1 = targeted nudge
   * 2 = micro-question
   * 3 = analogous technique
   * 4 = confidence-building next step / teacher escalation
   */
  scaffoldLevel: 0 | 1 | 2 | 3 | 4;

  /**
   * Optional reason for generating a friction alert.
   */
  alertReason: string | null;
}

/**
 * Select the mastery reward for a correct answer based
 * on how much scaffolding was needed on the previous attempt.
 */
function getCorrectDelta(
  previousHintCount: number,
): number {
  if (previousHintCount === 0) {
    return MASTERY_DELTA_NO_HINT;
  }

  if (previousHintCount === 1) {
    return MASTERY_DELTA_ONE_HINT;
  }

  return MASTERY_DELTA_WITH_HINTS;
}

/**
 * Determine whether the student has repeated the same
 * misconception as the previous turn.
 */
function hasRepeatedMisconception(
  current: string | null,
  previous: string | null,
): boolean {
  return (
    current !== null &&
    current === previous
  );
}

/**
 * Convert hint count into the corresponding scaffold level.
 *
 * The hint count is capped before this function is called.
 */
function scaffoldFromHintCount(
  hintCount: number,
): 0 | 1 | 2 | 3 {
  return clamp(
    hintCount,
    0,
    3,
  ) as 0 | 1 | 2 | 3;
}

/**
 * Apply one evaluated student turn.
 *
 * The function is pure:
 *
 *   previous state + evaluated outcome
 *             ↓
 *        new state
 *
 * It does not access the database, LLM, network, or filesystem.
 */
export function applyTurn(
  prev: MasteryState,
  input: TurnInput,
): TurnOutcome {
  const {
    isCorrect,
    matchedMisconception,
    secondsSpent,
    hintCap,
  } = input;

  /*
   * Protect the state from invalid client input.
   *
   * Negative time should never reduce total time-on-task.
   */
  const safeSecondsSpent = Number.isFinite(
    secondsSpent,
  )
    ? Math.max(0, secondsSpent)
    : 0;

  /*
   * hintCap is controlled by course configuration.
   *
   * At least one hint is allowed.
   */
  const safeHintCap = Math.max(
    1,
    Math.floor(
      Number.isFinite(hintCap)
        ? hintCap
        : 3,
    ),
  );

  const time_on_task_seconds =
    prev.time_on_task_seconds +
    safeSecondsSpent;

  const repeatedMisconception =
    hasRepeatedMisconception(
      matchedMisconception,
      prev.last_misconception,
    );

  /*
   * ============================================================
   * CORRECT TURN
   * ============================================================
   */
  if (isCorrect) {
    const correct_count =
      prev.correct_count + 1;

    const consecutive_successes =
      prev.consecutive_successes + 1;

    /*
     * Students who answer correctly without scaffolding
     * receive the strongest mastery increase.
     *
     * Students who required hints still gain mastery,
     * but at a lower rate.
     */
    let delta = getCorrectDelta(
      prev.hint_count,
    );

    /*
     * Every third consecutive success provides an additional
     * confidence/mastery boost.
     */
    if (
      consecutive_successes % 3 === 0
    ) {
      delta +=
        MASTERY_BONUS_EVERY_THREE_SUCCESSES;
    }

    const p_mastery = clamp(
      prev.p_mastery + delta,
      0,
      1,
    );

    /*
     * A successful response resets the hint sequence.
     *
     * A successful response also clears the last misconception
     * because the student has now demonstrated successful
     * understanding on this turn.
     */
    const state: MasteryState = {
      ...prev,

      p_mastery,

      correct_count,

      consecutive_successes,

      hint_count: 0,

      time_on_task_seconds,

      last_misconception: null,
    };

    return {
      state,

      /*
       * After success, return to open Socratic interaction.
       */
      scaffoldLevel: 0,

      alertReason: null,
    };
  }

  /*
   * ============================================================
   * INCORRECT TURN
   * ============================================================
   */

  const incorrect_count =
    prev.incorrect_count + 1;

  /*
   * Incorrect answers reduce mastery, but mastery can never
   * fall below zero.
   */
  const p_mastery = clamp(
    prev.p_mastery -
      MASTERY_PENALTY_INCORRECT,
    0,
    1,
  );

  /*
   * Determine whether the student has already reached
   * the configured hint cap.
   */
  const hintCapped =
    prev.hint_count >= safeHintCap;

  /*
   * Increment the hint count unless the cap has already
   * been reached.
   */
  const nextHintCount = hintCapped
    ? safeHintCap
    : prev.hint_count + 1;

  /*
   * The normal scaffold progression is:
   *
   *   incorrect #1 → level 1
   *   incorrect #2 → level 2
   *   incorrect #3 → level 3
   *   hint cap      → level 4
   *
   * A repeated misconception immediately escalates to level 4.
   */
  const normalScaffoldLevel =
    scaffoldFromHintCount(
      nextHintCount,
    );

  const scaffoldLevel: 0 | 1 | 2 | 3 | 4 =
    hintCapped ||
    repeatedMisconception
      ? MAX_SCAFFOLD_LEVEL
      : normalScaffoldLevel;

  /*
   * Reset the consecutive-success streak.
   */
  const consecutive_successes = 0;

  const state: MasteryState = {
    ...prev,

    p_mastery,

    incorrect_count,

    consecutive_successes,

    hint_count: clampHintCount(
      Math.min(nextHintCount, safeHintCap),
    ),

    time_on_task_seconds,

    last_misconception:
      matchedMisconception,
  };

  /*
   * Friction alerts are generated deterministically.
   *
   * Hint-cap escalation takes precedence over repeated
   * misconception because it represents the stronger
   * intervention condition.
   */
  let alertReason: string | null = null;

  if (hintCapped) {
    alertReason =
      'hint_cap_exceeded';
  } else if (repeatedMisconception) {
    alertReason =
      'repeated_misconception';
  }

  return {
    state,
    scaffoldLevel,
    alertReason,
  };
}

/**
 * Create the initial mastery state for a student/node pair.
 */
export function initialState(
  student_id: string,
  node_id: string,
  course_id: string,
): MasteryState {
  return {
    student_id,

    node_id,

    course_id,

    p_mastery: INITIAL_MASTERY,

    correct_count: 0,

    incorrect_count: 0,

    hint_count: 0,

    consecutive_successes: 0,

    time_on_task_seconds: 0,

    last_misconception: null,
  };
}
