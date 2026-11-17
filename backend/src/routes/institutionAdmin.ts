import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireInstitutionAdmin } from '../auth/middleware.js';
import { AVAILABLE_PACKS, isKnownPack } from '../curriculum/curriculumLoader.js';
import { asyncRoute } from './asyncRoute.js';

export const institutionAdminRouter = Router();
institutionAdminRouter.use(requireAuth, requireInstitutionAdmin);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_SQL = `SELECT m.id, m.lti_context_id, m.curriculum_pack_id, m.active, m.updated_at,
                         ld.deployment_id AS lti_deployment_id, lp.id AS platform_id, lp.issuer
                    FROM institution_curriculum_mappings m
                    JOIN lti_deployments ld ON ld.id = m.deployment_id
                    JOIN lti_platforms lp ON lp.id = ld.platform_id`;

institutionAdminRouter.get('/platforms', asyncRoute(async (req, res) => {
    const { rows } = await pool.query('SELECT id, issuer, client_id FROM lti_platforms WHERE institution_id = $1 ORDER BY issuer', [req.auth!.institutionId]);
    res.json({ platforms: rows });
}));

institutionAdminRouter.get('/curriculum-packs', (_req, res) => {
    res.json({ packs: AVAILABLE_PACKS.map((p) => ({ pack_id: p.pack_id, subject: p.subject, stage_label: p.stage_label })) });
});

institutionAdminRouter.get('/curriculum-mappings', asyncRoute(async (req, res) => {
    const { rows } = await pool.query(`${LIST_SQL} WHERE m.institution_id = $1 ORDER BY lp.issuer, m.lti_context_id`, [req.auth!.institutionId]);
    res.json({ mappings: rows });
}));

// Create, or update/re-activate, the mapping for an LMS course.
institutionAdminRouter.post('/curriculum-mappings', asyncRoute(async (req, res) => {
    const { platform_id, deployment_id, lti_context_id, curriculum_pack_id } = req.body ?? {};
    if (!UUID_RE.test(platform_id) || typeof deployment_id !== 'string' || !deployment_id.trim()
        || typeof lti_context_id !== 'string' || !lti_context_id.trim() || lti_context_id.length > 255) {
        return res.status(400).json({ error: 'platform_id, deployment_id and lti_context_id are required' });
    }
    if (!isKnownPack(curriculum_pack_id)) return res.status(400).json({ error: 'Unknown curriculum_pack_id' });

    const institutionId = req.auth!.institutionId;
    const { rowCount } = await pool.query('SELECT 1 FROM lti_platforms WHERE id = $1 AND institution_id = $2', [platform_id, institutionId]);
    if (!rowCount) return res.status(404).json({ error: 'Platform not found' });

    const { rows: [deployment] } = await pool.query(
        `INSERT INTO lti_deployments (platform_id, deployment_id) VALUES ($1, $2)
     ON CONFLICT (platform_id, deployment_id) DO UPDATE SET deployment_id = EXCLUDED.deployment_id RETURNING id`,
        [platform_id, deployment_id.trim()],
    );
    const { rows: [mapping] } = await pool.query(
        `INSERT INTO institution_curriculum_mappings (institution_id, deployment_id, lti_context_id, curriculum_pack_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (deployment_id, lti_context_id) DO UPDATE SET curriculum_pack_id = EXCLUDED.curriculum_pack_id, active = true, updated_at = now()
     RETURNING id`,
        [institutionId, deployment.id, lti_context_id.trim(), curriculum_pack_id],
    );
    res.status(201).json({ id: mapping.id });
}));

institutionAdminRouter.patch('/curriculum-mappings/:id', asyncRoute(async (req, res) => {
    const { curriculum_pack_id } = req.body ?? {};
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    if (!isKnownPack(curriculum_pack_id)) return res.status(400).json({ error: 'Unknown curriculum_pack_id' });
    const { rowCount } = await pool.query(
        'UPDATE institution_curriculum_mappings SET curriculum_pack_id = $1, updated_at = now() WHERE id = $2 AND institution_id = $3',
        [curriculum_pack_id, req.params.id, req.auth!.institutionId],
    );
    return rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Mapping not found' });
}));

// Deactivate rather than delete so the history of assignments is kept.
institutionAdminRouter.delete('/curriculum-mappings/:id', asyncRoute(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const { rowCount } = await pool.query(
        'UPDATE institution_curriculum_mappings SET active = false, updated_at = now() WHERE id = $1 AND institution_id = $2',
        [req.params.id, req.auth!.institutionId],
    );
    return rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Mapping not found' });
}));
