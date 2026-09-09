import { Router } from 'express';
import { pool } from '../db/pool.js';
import { masteryLabel } from '../types.js';

export const dashboardRouter = Router();

// 1. Knowledge Map for Student Journey (supports ?pack_id= and ?student_id=)
dashboardRouter.get('/courses/:id/knowledge-map', async (req, res) => {
  const courseId = req.params.id;
  const studentId = req.query.student_id as string;
  const requestedPackId = req.query.pack_id as string;

  // Resolve target pack: explicit query param > course configured pack > fallback
  let packId = requestedPackId;
  if (!packId) {
    const { rows: courseRows } = await pool.query(
      'SELECT curriculum_pack_id FROM courses WHERE id = $1',
      [courseId]
    );
    packId = courseRows[0]?.curriculum_pack_id ?? 'cambridge-math-stage-9';
  }

  // Fetch nodes for the target pack
  const { rows: nodes } = await pool.query(
    'SELECT * FROM curriculum_nodes WHERE pack_id = $1 ORDER BY order_index ASC',
    [packId]
  );

  // Fetch student mastery states for this course
  const { rows: states } = await pool.query(
    'SELECT node_id, p_mastery FROM mastery_states WHERE student_id = $1 AND course_id = $2',
    [studentId, courseId]
  );

  const byNode = Object.fromEntries(states.map((s) => [s.node_id, s.p_mastery]));

  res.json(
    nodes.map((n) => {
      const p_mastery = byNode[n.id] ?? 0.1;
      return {
        ...n,
        p_mastery,
        mastery_label: masteryLabel(p_mastery),
      };
    })
  );
});

// 2. Class-wide Heatmap (also supports ?pack_id= override)
dashboardRouter.get('/courses/:id/heatmap', async (req, res) => {
  const courseId = req.params.id;
  const requestedPackId = req.query.pack_id as string;

  const { rows } = await pool.query(
    `SELECT n.id AS node_id, n.title, n.strand, COALESCE(AVG(ms.p_mastery), 0.1) AS avg_mastery, COUNT(ms.id) AS student_count
     FROM curriculum_nodes n
     LEFT JOIN mastery_states ms ON ms.node_id = n.id AND ms.course_id = $1
     WHERE n.pack_id = COALESCE($2, (SELECT curriculum_pack_id FROM courses WHERE id = $1))
     GROUP BY n.id, n.order_index ORDER BY n.order_index ASC`,
    [courseId, requestedPackId || null]
  );
  res.json(rows);
});

// 3. Curriculum Switcher: allows Teacher or Student to change course default pack
dashboardRouter.patch('/courses/:id/curriculum', async (req, res) => {
  const { curriculum_pack_id } = req.body;
  if (!curriculum_pack_id) {
    return res.status(400).json({ error: 'curriculum_pack_id is required' });
  }

  const { rows } = await pool.query(
    'UPDATE courses SET curriculum_pack_id = $2 WHERE id = $1 RETURNING id, title, curriculum_pack_id',
    [req.params.id, curriculum_pack_id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Course not found' });
  res.json(rows[0]);
});

dashboardRouter.get('/courses/:id/live-states', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ms.*, u.display_name, n.title AS node_title, n.strand
     FROM mastery_states ms 
     JOIN users u ON u.id = ms.student_id 
     JOIN curriculum_nodes n ON n.id = ms.node_id
     WHERE ms.course_id = $1 ORDER BY ms.updated_at DESC LIMIT 30`,
    [req.params.id]
  );
  res.json(rows);
});

dashboardRouter.get('/courses/:id/alerts', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT fa.*, u.display_name AS student_name, n.title AS node_title
     FROM friction_alerts fa 
     JOIN users u ON u.id = fa.student_id 
     LEFT JOIN curriculum_nodes n ON n.id = fa.node_id
     WHERE fa.course_id = $1 AND fa.resolved = false 
     ORDER BY fa.created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

dashboardRouter.post('/alerts/:id/resolve', async (req, res) => {
  await pool.query('UPDATE friction_alerts SET resolved = true WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

dashboardRouter.patch('/courses/:id/rules', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE courses SET scaffold_rules = $2 WHERE id = $1 RETURNING scaffold_rules',
    [req.params.id, req.body.scaffold_rules]
  );
  res.json(rows[0]);
});

dashboardRouter.get('/courses/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

dashboardRouter.get('/courses/:id/ags-log', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT al.*, u.display_name, n.title AS node_title 
     FROM ags_passback_log al
     JOIN users u ON u.id = al.student_id 
     LEFT JOIN curriculum_nodes n ON n.id = al.node_id
     WHERE al.course_id = $1 ORDER BY al.created_at DESC LIMIT 20`,
    [req.params.id]
  );
  res.json(rows);
});