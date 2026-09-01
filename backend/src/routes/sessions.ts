import { Router } from 'express';
import { pool } from '../db/pool.js';
import { startNodeSession, runStudentTurn, askExploratory } from '../engine/socraticEngine.js';
import { broadcastToTeachers } from '../ws/hub.js';

export const sessionsRouter = Router();

sessionsRouter.post('/sessions', async (req, res) => {
  const { student_id, course_id, node_id } = req.body as { student_id: string; course_id: string; node_id: string };
  try {
    res.json(await startNodeSession(student_id, course_id, node_id));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

sessionsRouter.post('/sessions/:id/turns', async (req, res) => {
  const session_id = req.params.id;
  const { student_id, course_id, node_id, question, studentAttempt, secondsSpent } = req.body as {
    student_id: string; course_id: string; node_id: string; question: string; studentAttempt: string; secondsSpent: number;
  };

  const result = await runStudentTurn({ session_id, student_id, course_id, node_id, question, studentAttempt, secondsSpent: secondsSpent ?? 0 });
  if (result.alert) broadcastToTeachers(course_id, result.alert);
  broadcastToTeachers(course_id, { type: 'state_update', course_id, node_id, student_id, session_id, payload: result.state });

  res.json(result);
});

// Exploratory mode: open conceptual question, no scaffold state machine.
sessionsRouter.post('/exploratory', async (req, res) => {
  const { course_id, node_id, studentQuery } = req.body as { course_id: string; node_id: string | null; studentQuery: string };
  const answer = await askExploratory({ course_id, node_id: node_id ?? null, studentQuery });
  res.json({ answer });
});

sessionsRouter.get('/sessions/:id/turns', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM turns WHERE session_id = $1 ORDER BY created_at ASC', [req.params.id]);
  res.json(rows);
});
