import { Router } from 'express';
import { pool } from '../db/pool.js';
import { masteryLabel } from '../types.js';
import { AVAILABLE_PACKS } from '../curriculum/curriculumLoader.js';

export const nodesRouter = Router();

nodesRouter.get('/packs', (_req, res) => {
  res.json(AVAILABLE_PACKS.map((p) => ({ pack_id: p.pack_id, subject: p.subject, stage_label: p.stage_label, strands: p.strands })));
});

nodesRouter.get('/courses/:id/knowledge-map', async (req, res) => {
  const { rows: courseRows } = await pool.query('SELECT curriculum_pack_id FROM courses WHERE id = $1', [req.params.id]);
  if (!courseRows[0]) return res.status(404).json({ error: 'course not found' });

  const studentId = req.query.student_id as string;
  const { rows: nodes } = await pool.query(
    'SELECT * FROM curriculum_nodes WHERE pack_id = $1 ORDER BY order_index ASC',
    [courseRows[0].curriculum_pack_id]
  );
  const { rows: states } = await pool.query(
    'SELECT node_id, p_mastery FROM mastery_states WHERE student_id = $1 AND course_id = $2',
    [studentId, req.params.id]
  );
  const byNode = Object.fromEntries(states.map((s) => [s.node_id, s.p_mastery]));

  res.json(nodes.map((n) => {
    const p_mastery = byNode[n.id] ?? 0.1;
    return { ...n, p_mastery, mastery_label: masteryLabel(p_mastery) };
  }));
});
