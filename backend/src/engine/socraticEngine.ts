import { randomUUID } from 'crypto';

import { pool } from '../db/pool.js';
import { llm } from '../llm/index.js';

import {
  applyTurn,
  initialState,
} from './masteryEngine.js';

import {
  retrieveResources,
} from '../retrieval/retrieval.js';

import {
  passbackMastery,
} from '../lti/ags.js';

import type {
  CurriculumNode,
  MasteryState,
  WsEvent,
} from '../types.js';

/**
 * Load a curriculum node.
 */
async function loadNode(
  nodeId: string,
): Promise<CurriculumNode> {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM curriculum_nodes
      WHERE id = $1
      LIMIT 1
    `,
    [nodeId],
  );

  if (!rows[0]) {
    throw new Error(`Curriculum node not found: ${nodeId}`);
  }

  return rows[0] as CurriculumNode;
}

/**
 * Load the student's mastery state for a node.
 *
 * If no state exists yet, return the initial state without
 * immediately writing it to the database.
 */
async function loadState(
  studentId: string,
  nodeId: string,
  courseId: string,
): Promise<MasteryState> {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM mastery_states
      WHERE student_id = $1
        AND node_id = $2
      LIMIT 1
    `,
    [studentId, nodeId],
  );

  return (
    rows[0] ??
    initialState(
      studentId,
      nodeId,
      courseId,
    )
  );
}

/**
 * Load teacher/course-controlled scaffold settings.
 *
 * hintCap controls when the mastery engine can escalate
 * friction handling.
 *
 * pedagogyDirectness:
 *   0 = strongly Socratic
 *   1 = maximally direct
 */
async function loadScaffoldRules(
  courseId: string,
): Promise<{
  hintCap: number;
  pedagogyDirectness: number;
}> {
  const { rows } = await pool.query(
    `
      SELECT scaffold_rules
      FROM courses
      WHERE id = $1
      LIMIT 1
    `,
    [courseId],
  );

  const rules =
    rows[0]?.scaffold_rules ?? {};

  const hintCap =
    typeof rules.friction_threshold_hints === 'number'
      ? rules.friction_threshold_hints
      : 3;

  const pedagogyDirectness =
    typeof rules.pedagogy_directness === 'number'
      ? Math.min(
          1,
          Math.max(0, rules.pedagogy_directness),
        )
      : 0.3;

  return {
    hintCap,
    pedagogyDirectness,
  };
}

/**
 * Load a question for a curriculum node.
 *
 * V2 keeps the question and its misconception triggers
 * together so that evaluation is based on the exact question
 * being shown to the student.
 */
async function loadQuestion(
  nodeId: string,
): Promise<{
  id: string;
  prompt: string;
  misconceptionTriggers: string[];
}> {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        prompt,
        misconception_triggers
      FROM node_questions
      WHERE node_id = $1
      ORDER BY random()
      LIMIT 1
    `,
    [nodeId],
  );

  if (!rows[0]) {
    throw new Error(
      `No question seeded for curriculum node: ${nodeId}`,
    );
  }

  return {
    id: rows[0].id,
    prompt: rows[0].prompt,
    misconceptionTriggers:
      rows[0].misconception_triggers ?? [],
  };
}

/**
 * Start a new guided Socratic session.
 */
export async function startNodeSession(
  studentId: string,
  courseId: string,
  nodeId: string,
) {
  const node = await loadNode(nodeId);
  const question = await loadQuestion(nodeId);

  const sessionId = randomUUID();

  await pool.query(
    `
      INSERT INTO sessions (
        id,
        student_id,
        course_id,
        node_id,
        mode,
        question_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      sessionId,
      studentId,
      courseId,
      nodeId,
      'socratic',
      question.id,
    ],
  );

  const state = await loadState(
    studentId,
    nodeId,
    courseId,
  );

  return {
    session_id: sessionId,
    node,
    question: question.prompt,
    question_id: question.id,
    state,
  };
}

export interface TurnResult {
  state: MasteryState;

  scaffold_level: 0 | 1 | 2 | 3 | 4;

  message: string;

  alert?: WsEvent;
}

/**
 * Run one student turn through the Agora v2 pipeline.
 *
 * Pipeline:
 *
 *   Student attempt
 *        ↓
 *   Curriculum context
 *        ↓
 *   Retrieval
 *        ↓
 *   LLM evaluation
 *        ↓
 *   Mastery engine
 *        ↓
 *   Scaffold selection
 *        ↓
 *   LLM scaffold generation
 *        ↓
 *   Persist turn/state
 *        ↓
 *   Optional LMS passback
 */
export async function runStudentTurn(
  opts: {
    session_id: string;
    student_id: string;
    course_id: string;
    node_id: string;
    question: string;
    studentAttempt: string;
    secondsSpent: number;
  },
): Promise<TurnResult> {
  const {
    session_id,
    student_id,
    course_id,
    node_id,
    question,
    studentAttempt,
    secondsSpent,
  } = opts;

  /*
   * 1. Load curriculum context.
   */
  const node = await loadNode(node_id);

  /*
   * 2. Verify that the session belongs to this student/course/node.
   *
   * This prevents a client from submitting a turn against
   * an unrelated session.
   */
  const { rows: sessionRows } =
    await pool.query(
      `
        SELECT
          id,
          student_id,
          course_id,
          node_id
        FROM sessions
        WHERE id = $1
        LIMIT 1
      `,
      [session_id],
    );

  const session = sessionRows[0];

  if (!session) {
    throw new Error(
      `Session not found: ${session_id}`,
    );
  }

  if (
    session.student_id !== student_id ||
    session.course_id !== course_id ||
    session.node_id !== node_id
  ) {
    throw new Error(
      'Session does not belong to the supplied student, course, and node.',
    );
  }

  /*
   * 3. Load the exact question associated with the session.
   *
   * V1 queried a random/first question for misconception
   * triggers, which could differ from the question actually
   * presented to the student.
   */
  const { rows: questionRows } =
    await pool.query(
      `
        SELECT
          nq.id,
          nq.prompt,
          nq.misconception_triggers
        FROM sessions s
        JOIN node_questions nq
          ON nq.id = s.question_id
        WHERE s.id = $1
        LIMIT 1
      `,
      [session_id],
    );

  const sessionQuestion =
    questionRows[0];

  if (!sessionQuestion) {
    throw new Error(
      `Question for session not found: ${session_id}`,
    );
  }

  /*
   * Use the persisted question as the source of truth.
   *
   * The client-provided question is retained in the function
   * signature for compatibility, but should not be trusted
   * over the database value.
   */
  const activeQuestion =
    sessionQuestion.prompt;

  const misconceptionTriggers: string[] =
    sessionQuestion.misconception_triggers ?? [];

  /*
   * 4. Load teacher/course-controlled pedagogy settings.
   */
  const {
    hintCap,
    pedagogyDirectness,
  } = await loadScaffoldRules(course_id);

  /*
   * 5. Retrieve relevant resources.
   *
   * These resources are passed to both evaluation and
   * scaffold generation.
   */
  const resources =
    await retrieveResources(
      node,
      course_id,
      activeQuestion,
    );

  /*
   * 6. Load the student's previous mastery state.
   */
  const previousState =
    await loadState(
      student_id,
      node_id,
      course_id,
    );

  /*
   * 7. Ask the configured LLM to evaluate the attempt.
   *
   * The engine does not care whether this is Gemini,
   * Claude, or another provider.
   */
  const evaluation =
    await llm.evaluateTurn({
      node,
      question: activeQuestion,
      studentAttempt,
      misconceptionTriggers,
      resources,
    });

  /*
   * 8. Apply deterministic mastery logic.
   *
   * The LLM evaluates.
   * The mastery engine decides the state transition.
   */
  const {
    state: nextState,
    scaffoldLevel,
    alertReason,
  } = applyTurn(
    previousState,
    {
      isCorrect:
        evaluation.is_correct,

      matchedMisconception:
        evaluation.matched_misconception,

      secondsSpent,

      hintCap,
    },
  );

  /*
   * 9. Persist mastery state.
   */
  await pool.query(
    `
      INSERT INTO mastery_states (
        student_id,
        node_id,
        course_id,
        p_mastery,
        correct_count,
        incorrect_count,
        hint_count,
        consecutive_successes,
        time_on_task_seconds,
        last_misconception,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, now()
      )
      ON CONFLICT (
        student_id,
        node_id
      )
      DO UPDATE SET
        course_id = EXCLUDED.course_id,
        p_mastery = EXCLUDED.p_mastery,
        correct_count = EXCLUDED.correct_count,
        incorrect_count = EXCLUDED.incorrect_count,
        hint_count = EXCLUDED.hint_count,
        consecutive_successes = EXCLUDED.consecutive_successes,
        time_on_task_seconds = EXCLUDED.time_on_task_seconds,
        last_misconception = EXCLUDED.last_misconception,
        updated_at = now()
    `,
    [
      student_id,
      node_id,
      course_id,
      nextState.p_mastery,
      nextState.correct_count,
      nextState.incorrect_count,
      nextState.hint_count,
      nextState.consecutive_successes,
      nextState.time_on_task_seconds,
      nextState.last_misconception,
    ],
  );

  /*
   * 10. Generate the scaffold.
   *
   * The scaffold generator receives:
   * - curriculum
   * - student's attempt
   * - retrieval
   * - evaluation
   * - deterministic scaffold level
   * - teacher-controlled pedagogy directness
   */
  const scaffold =
    await llm.generateScaffold({
      node,
      question: activeQuestion,
      studentAttempt,
      misconceptionTriggers,
      resources,
      evaluation,
      scaffoldLevel,
      pedagogyDirectness,
    });

  /*
   * 11. Persist the student's turn.
   */
  await pool.query(
    `
      INSERT INTO turns (
        session_id,
        role,
        content,
        is_correct
      )
      VALUES ($1, 'student', $2, $3)
    `,
    [
      session_id,
      studentAttempt,
      evaluation.is_correct,
    ],
  );

  /*
   * 12. Persist the tutor response.
   */
  await pool.query(
    `
      INSERT INTO turns (
        session_id,
        role,
        content,
        scaffold_level
      )
      VALUES ($1, 'tutor', $2, $3)
    `,
    [
      session_id,
      scaffold.message,
      scaffold.scaffold_level,
    ],
  );

  /*
   * 13. Handle friction alerts.
   */
  let alert: WsEvent | undefined;

  if (alertReason) {
    await pool.query(
      `
        INSERT INTO friction_alerts (
          session_id,
          student_id,
          course_id,
          node_id,
          reason,
          hint_count
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        session_id,
        student_id,
        course_id,
        node_id,
        alertReason,
        nextState.hint_count,
      ],
    );

    alert = {
      type: 'friction_alert',
      course_id,
      node_id,
      student_id,
      session_id,
      payload: {
        reason: alertReason,
        hint_count:
          nextState.hint_count,
        question: activeQuestion,
      },
    };
  }

  /*
   * 14. Fire-and-forget LMS mastery passback.
   *
   * A temporary LMS outage must never prevent the student
   * from receiving their next tutor response.
   */
  passbackMastery(
    course_id,
    student_id,
    node_id,
    nextState.p_mastery,
  ).catch(() => {
    // Intentionally ignored.
    // LMS passback must never block the tutoring experience.
  });

  /*
   * 15. Return the complete turn result.
   */
  return {
    state: nextState,
    scaffold_level:
      scaffold.scaffold_level,
    message: scaffold.message,
    alert,
  };
}

/**
 * Exploratory mode.
 *
 * This mode:
 * - does not mutate mastery
 * - does not select a scaffold level
 * - can operate without a curriculum node
 * - uses retrieval where curriculum context exists
 */
export async function askExploratory(
  opts: {
    course_id: string;
    node_id: string | null;
    studentQuery: string;
  },
): Promise<string> {
  const {
    course_id,
    node_id,
    studentQuery,
  } = opts;

  const node = node_id
    ? await loadNode(node_id)
    : null;

  const resources = node
    ? await retrieveResources(
        node,
        course_id,
        studentQuery,
      )
    : [];

  return llm.generateExploratoryAnswer({
    node,
    studentQuery,
    resources,
  });
}

