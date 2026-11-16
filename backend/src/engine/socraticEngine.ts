import { createHash, randomUUID } from 'crypto';

import { pool, lockPool } from '../db/pool.js';
import { llm } from '../llm/index.js';

import {
    applyTurn,
    initialState,
} from './masteryEngine.js';

import {
    retrieveResources,
} from '../retrieval/retrieval.js';

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
              AND course_id = $3
              AND node_id = $2
                LIMIT 1
        `,
        [studentId, nodeId, courseId],
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
    const { rows: courseRows } = await pool.query('SELECT curriculum_pack_id FROM courses WHERE id=$1', [courseId]);
    if (!courseRows[0]) throw new Error('Course not found.');
    if (courseRows[0].curriculum_pack_id !== node.pack_id) throw new Error('Curriculum node does not belong to this course curriculum pack.');
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
        idempotency_key: string;
    },
): Promise<TurnResult> {
    const { session_id, student_id, course_id, node_id, studentAttempt, idempotency_key } = opts;
    if (!idempotency_key || idempotency_key.length < 8 || idempotency_key.length > 128) throw new Error('A valid Idempotency-Key header is required.');
    if (!studentAttempt || studentAttempt.length > 12000) throw new Error('Student attempt must be between 1 and 12000 characters.');
    const rawSecondsSpent = Number(opts.secondsSpent ?? 0);
    const secondsSpent = Number.isFinite(rawSecondsSpent)
        ? Math.max(0, Math.min(3600, Math.floor(rawSecondsSpent)))
        : 0;

    // A PostgreSQL session-level advisory lock serializes all turns for one session,
    // including the LLM calls. This intentionally holds one pool connection, not a
    // transaction, while external providers run. It prevents stale mastery writes.
    const lockClient = await lockPool.connect();
    const lockKey = `${session_id}`;
    let locked = false;
    try {
        await lockClient.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [lockKey]);
        locked = true;

        const { rows: sessionRows } = await lockClient.query(
            `SELECT s.id, s.student_id, s.course_id, s.node_id, s.question_id,
              c.curriculum_pack_id, n.pack_id AS node_pack_id
         FROM sessions s JOIN courses c ON c.id=s.course_id
         LEFT JOIN curriculum_nodes n ON n.id=s.node_id
        WHERE s.id=$1`, [session_id],
        );
        const session = sessionRows[0];
        if (!session) throw new Error('Session not found.');
        if (session.student_id !== student_id || session.course_id !== course_id || session.node_id !== node_id) {
            throw new Error('Session does not belong to the authenticated student, course, and node.');
        }
        if (session.curriculum_pack_id !== session.node_pack_id) {
            throw new Error('Curriculum node does not belong to this course curriculum pack.');
        }
        const requestHash = createHash('sha256').update(JSON.stringify({ studentAttempt, secondsSpent })).digest('hex');
        const { rows: priorRequests } = await lockClient.query(
            'SELECT request_hash,response_json FROM session_turn_requests WHERE session_id=$1 AND idempotency_key=$2',
            [session_id, idempotency_key],
        );
        if (priorRequests[0]) {
            if (priorRequests[0].request_hash !== requestHash) throw new Error('Idempotency-Key was already used with a different request body.');
            return priorRequests[0].response_json as TurnResult;
        }

        const node = await loadNode(node_id);
        const { rows: questionRows } = await lockClient.query(
            `SELECT id, prompt, misconception_triggers FROM node_questions WHERE id=$1 AND node_id=$2`,
            [session.question_id, node_id],
        );
        const sessionQuestion = questionRows[0];
        if (!sessionQuestion) throw new Error('The persisted session question could not be found.');
        const activeQuestion = sessionQuestion.prompt as string;
        const misconceptionTriggers: string[] = sessionQuestion.misconception_triggers ?? [];
        const { hintCap, pedagogyDirectness } = await loadScaffoldRules(course_id);
        const resources = await retrieveResources(node, course_id, activeQuestion);
        const previousState = await loadState(student_id, node_id, course_id);

        // LLM output is prepared before committing any learning-state mutation.
        const evaluation = await llm.evaluateTurn({ node, question: activeQuestion, studentAttempt, misconceptionTriggers, resources });
        const { state: nextState, scaffoldLevel, alertReason } = applyTurn(previousState, {
            isCorrect: evaluation.is_correct,
            matchedMisconception: evaluation.matched_misconception,
            secondsSpent,
            hintCap,
        });
        const scaffold = await llm.generateScaffold({
            node, question: activeQuestion, studentAttempt, misconceptionTriggers, resources,
            evaluation, scaffoldLevel, pedagogyDirectness,
        });

        // One transaction makes conversation history, mastery, alert and LMS outbox
        // consistent. Passback runs asynchronously from the durable outbox worker.
        const client = await pool.connect();
        let alert: WsEvent | undefined;
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO mastery_states (
          student_id,node_id,course_id,p_mastery,correct_count,incorrect_count,hint_count,
          consecutive_successes,time_on_task_seconds,last_misconception,updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
        ON CONFLICT (student_id,course_id,node_id) DO UPDATE SET
          p_mastery=EXCLUDED.p_mastery, correct_count=EXCLUDED.correct_count,
          incorrect_count=EXCLUDED.incorrect_count, hint_count=EXCLUDED.hint_count,
          consecutive_successes=EXCLUDED.consecutive_successes,
          time_on_task_seconds=EXCLUDED.time_on_task_seconds,
          last_misconception=EXCLUDED.last_misconception, updated_at=now()`,
                [student_id,node_id,course_id,nextState.p_mastery,nextState.correct_count,nextState.incorrect_count,
                    nextState.hint_count,nextState.consecutive_successes,nextState.time_on_task_seconds,nextState.last_misconception],
            );
            await client.query(
                `INSERT INTO turns(session_id,role,content,is_correct) VALUES($1,'student',$2,$3)`,
                [session_id,studentAttempt,evaluation.is_correct],
            );
            await client.query(
                `INSERT INTO turns(session_id,role,content,scaffold_level) VALUES($1,'tutor',$2,$3)`,
                [session_id,scaffold.message,scaffold.scaffold_level],
            );
            if (alertReason) {
                await client.query(
                    `INSERT INTO friction_alerts(session_id,student_id,course_id,node_id,reason,hint_count)
           VALUES($1,$2,$3,$4,$5,$6)`,
                    [session_id,student_id,course_id,node_id,alertReason,nextState.hint_count],
                );
                alert = {
                    type: 'friction_alert', course_id, node_id, student_id, session_id,
                    payload: { reason: alertReason, hint_count: nextState.hint_count, question: activeQuestion },
                };
            }
            await client.query(
                `INSERT INTO lms_passback_jobs(course_id,student_id,node_id,score)
         SELECT $1,$2,$3,$4 WHERE EXISTS (
           SELECT 1 FROM courses c WHERE c.id=$1 AND c.ags_lineitem_url IS NOT NULL
         ) AND EXISTS (
           SELECT 1 FROM course_memberships cm WHERE cm.course_id=$1 AND cm.user_id=$2
             AND cm.lti_user_lineitem_sub IS NOT NULL
         )`, [course_id,student_id,node_id,nextState.p_mastery],
            );
            const response: TurnResult = { state: nextState, scaffold_level: scaffold.scaffold_level, message: scaffold.message, alert };
            await client.query(
                `INSERT INTO session_turn_requests(session_id,idempotency_key,request_hash,response_json) VALUES($1,$2,$3,$4::jsonb)`,
                [session_id,idempotency_key,requestHash,JSON.stringify(response)],
            );
            await client.query('UPDATE sessions SET turn_version=turn_version+1 WHERE id=$1', [session_id]);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally { client.release(); }

        return { state: nextState, scaffold_level: scaffold.scaffold_level, message: scaffold.message, alert };
    } finally {
        if (locked) await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]).catch(() => undefined);
        lockClient.release();
    }
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
    if (node) {
        const { rows } = await pool.query('SELECT curriculum_pack_id FROM courses WHERE id=$1', [course_id]);
        if (!rows[0] || rows[0].curriculum_pack_id !== node.pack_id) throw new Error('Curriculum node does not belong to this course curriculum pack.');
    }

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

