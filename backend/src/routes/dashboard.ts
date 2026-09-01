import { Router } from 'express';
import { pool } from '../db/pool.js';

export const dashboardRouter = Router();

// Class-wide concept mastery heatmap: every node in the course's pack x average mastery.
dashboardRouter.get('/courses/:id/heatmap', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.id AS node_id, n.title, n.strand, COALESCE(AVG(ms.p_mastery), 0.1) AS avg_mastery, COUNT(ms.id) AS student_count
     FROM curriculum_nodes n
     LEFT JOIN mastery_states ms ON ms.node_id = n.id AND ms.course_id = $1
     WHERE n.pack_id = (SELECT curriculum_pack_id FROM courses WHERE id = $1)
     GROUP BY n.id, n.order_index ORDER BY n.order_index ASC`,
    [req.params.id]
  );
  res.json(rows);
});

dashboardRouter.get('/courses/:id/live-states', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ms.*, u.display_name, n.title AS node_title, n.strand
     FROM mastery_states ms JOIN users u ON u.id = ms.student_id JOIN curriculum_nodes n ON n.id = ms.node_id
     WHERE ms.course_id = $1 ORDER BY ms.updated_at DESC LIMIT 30`,
    [req.params.id]
  );
  res.json(rows);
});

dashboardRouter.get('/courses/:id/alerts', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT fa.*, u.display_name, n.title AS node_title
     FROM friction_alerts fa JOIN users u ON u.id = fa.student_id LEFT JOIN curriculum_nodes n ON n.id = fa.node_id
     WHERE fa.course_id = $1 AND fa.resolved = false ORDER BY fa.created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

dashboardRouter.post('/alerts/:id/resolve', async (req, res) => {
  await pool.query('UPDATE friction_alerts SET resolved = true WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Pedagogy slider + hint-cap tuning, both read by the socratic engine per turn.
dashboardRouter.patch('/courses/:id/rules', async (req, res) => {
  const { rows } = await pool.query('UPDATE courses SET scaffold_rules = $2 WHERE id = $1 RETURNING scaffold_rules', [req.params.id, req.body.scaffold_rules]);
  res.json(rows[0]);
});

dashboardRouter.get('/courses/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

dashboardRouter.get('/courses/:id/ags-log', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT al.*, u.display_name, n.title AS node_title FROM ags_passback_log al
     JOIN users u ON u.id = al.student_id LEFT JOIN curriculum_nodes n ON n.id = al.node_id
     WHERE al.course_id = $1 ORDER BY al.created_at DESC LIMIT 20`,
    [req.params.id]
  );
  res.json(rows);
});
