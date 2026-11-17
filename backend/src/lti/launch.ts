import { Router } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { asyncRoute } from '../routes/asyncRoute.js';

export interface SessionUser {
  id: string;
  display_name: string;
  role: 'Teacher' | 'Student';
  course_id: string;
  class_code: string;
}

const LTI_CLAIMS = {
  deployment_id: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  ags: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const launchRouter = Router();

launchRouter.post('/lti/launch', asyncRoute(async (req, res) => {
  const { id_token, state } = req.body as { id_token?: string; state?: string };
  if (typeof id_token !== 'string' || typeof state !== 'string') return res.status(400).send('Missing id_token or state.');

  // Atomic single-use consume: works across backend instances.
  const { rows: [pending] } = await pool.query(
      'DELETE FROM lti_login_states WHERE state = $1 AND expires_at > now() RETURNING nonce, platform_id',
      [state],
  );
  if (!pending) return res.status(400).send('Unknown or expired state — retry the launch.');

  const { rows: [platform] } = await pool.query('SELECT * FROM lti_platforms WHERE id = $1', [pending.platform_id]);
  if (!platform) return res.status(400).send('Unregistered platform.');

  let jwks = jwksCache.get(platform.platform_jwks_url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(platform.platform_jwks_url));
    jwksCache.set(platform.platform_jwks_url, jwks);
  }

  let claims;
  try {
    claims = (await jwtVerify(id_token, jwks, { issuer: platform.issuer, audience: platform.client_id })).payload;
  } catch (e) {
    return res.status(401).send(`id_token verification failed: ${(e as Error).message}`);
  }
  if (claims.nonce !== pending.nonce) return res.status(401).send('nonce mismatch.');

  const deploymentId = claims[LTI_CLAIMS.deployment_id] as string | undefined;
  const context = claims[LTI_CLAIMS.context] as { id?: string; title?: string } | undefined;
  if (!deploymentId || !context?.id) return res.status(400).send('Launch is missing deployment or course context.');

  const { rows: [mapping] } = await pool.query(
      `SELECT ld.id AS deployment_row_id, m.curriculum_pack_id
       FROM lti_deployments ld
       JOIN institution_curriculum_mappings m ON m.deployment_id = ld.id
      WHERE ld.platform_id = $1 AND ld.deployment_id = $2 AND m.lti_context_id = $3
        AND m.active AND m.institution_id = $4`,
      [platform.id, deploymentId, context.id, platform.institution_id],
  );
  if (!mapping) return res.status(403).send('This course has no curriculum assigned. Ask your institution administrator to configure it.');

  const roles = (claims[LTI_CLAIMS.roles] as string[]) ?? [];
  const role: 'Teacher' | 'Student' = roles.some((r) => /Instructor|Administrator/i.test(r)) ? 'Teacher' : 'Student';
  const ags = claims[LTI_CLAIMS.ags] as { lineitem?: string } | undefined;
  const sub = claims.sub as string;

  const { rows: [course] } = await pool.query(
      `INSERT INTO courses (institution_id, deployment_id, lti_context_id, title, curriculum_pack_id, ags_lineitem_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (deployment_id, lti_context_id) DO UPDATE SET
       title = EXCLUDED.title,
       curriculum_pack_id = EXCLUDED.curriculum_pack_id,
       ags_lineitem_url = COALESCE(EXCLUDED.ags_lineitem_url, courses.ags_lineitem_url)
     RETURNING id`,
      [platform.institution_id, mapping.deployment_row_id, context.id, context.title ?? 'Untitled course', mapping.curriculum_pack_id, ags?.lineitem ?? null],
  );

  const { rows: [user] } = await pool.query(
      `INSERT INTO users (institution_id, lti_sub, role, display_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (institution_id, lti_sub) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
      [platform.institution_id, sub, role, (claims.name as string) ?? 'Anonymous'],
  );

  await pool.query(
      `INSERT INTO course_memberships (course_id, user_id, lti_user_lineitem_sub, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (course_id, user_id) DO UPDATE SET lti_user_lineitem_sub = EXCLUDED.lti_user_lineitem_sub, role = EXCLUDED.role`,
      [course.id, user.id, sub, role],
  );

  const code = randomBytes(32).toString('base64url');
  await pool.query(
      `INSERT INTO lti_launch_codes (user_id, code_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '2 minutes')`,
      [user.id, createHash('sha256').update(code).digest('hex')],
  );

  res.redirect(`${config.frontendUrl}/?launch=${code}`);
}));
