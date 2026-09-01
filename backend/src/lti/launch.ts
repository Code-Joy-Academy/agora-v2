import { Router } from 'express';
import { randomUUID } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pool } from '../db/pool.js';
import { oidcLoginStore } from './oidc.js';

export const sessionCodeStore = new Map<string, { expires: number; user: SessionUser }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionCodeStore) if (v.expires < now) sessionCodeStore.delete(k);
}, 60_000).unref();

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

launchRouter.post('/lti/launch', async (req, res) => {
  const { id_token, state } = req.body as { id_token: string; state: string };
  const pending = oidcLoginStore.get(state);
  if (!pending) return res.status(400).send('Unknown or expired state — retry the launch.');
  oidcLoginStore.delete(state); // single use

  const unverified = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString('utf-8'));

  const { rows: platformRows } = await pool.query(
    'SELECT lp.*, i.id AS institution_id FROM lti_platforms lp JOIN institutions i ON i.id = lp.institution_id WHERE lp.issuer = $1',
    [unverified.iss]
  );
  const platform = platformRows[0];
  if (!platform) return res.status(400).send('Unregistered platform.');

  let jwks = jwksCache.get(platform.platform_jwks_url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(platform.platform_jwks_url));
    jwksCache.set(platform.platform_jwks_url, jwks);
  }

  let claims;
  try {
    const verified = await jwtVerify(id_token, jwks, { issuer: platform.issuer, audience: platform.client_id });
    claims = verified.payload;
  } catch (e) {
    return res.status(401).send(`id_token verification failed: ${(e as Error).message}`);
  }
  if (claims.nonce !== pending.nonce) return res.status(401).send('nonce mismatch.');

  const deployment_id = claims[LTI_CLAIMS.deployment_id] as string;
  const { rows: depRows } = await pool.query(
    `INSERT INTO lti_deployments (platform_id, deployment_id) VALUES ($1, $2)
     ON CONFLICT (platform_id, deployment_id) DO UPDATE SET deployment_id = EXCLUDED.deployment_id RETURNING id`,
    [platform.id, deployment_id]
  );
  const deployment_row_id = depRows[0].id;

  const roles = (claims[LTI_CLAIMS.roles] as string[]) ?? [];
  const role: 'Teacher' | 'Student' = roles.some((r) => /Instructor|Administrator/i.test(r)) ? 'Teacher' : 'Student';

  const context = (claims[LTI_CLAIMS.context] as { id: string; title: string }) ?? { id: 'default', title: 'Untitled course' };
  const ags = claims[LTI_CLAIMS.ags] as { lineitem?: string } | undefined;

  const { rows: courseRows } = await pool.query(
    `INSERT INTO courses (institution_id, deployment_id, lti_context_id, title, curriculum_pack_id, ags_lineitem_url)
     VALUES ($1, $2, $3, $4, 'cambridge-stage8-english', $5)
     ON CONFLICT (deployment_id, lti_context_id) DO UPDATE SET title = EXCLUDED.title, ags_lineitem_url = COALESCE(EXCLUDED.ags_lineitem_url, courses.ags_lineitem_url)
     RETURNING id`,
    [platform.institution_id, deployment_row_id, context.id, context.title, ags?.lineitem ?? null]
  );
  const course_id = courseRows[0].id;

  const sub = claims.sub as string;
  const display_name = (claims.name as string) ?? 'Anonymous';
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (institution_id, lti_sub, role, display_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (institution_id, lti_sub) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
    [platform.institution_id, sub, role, display_name]
  );
  const user_id = userRows[0].id;

  await pool.query(
    `INSERT INTO course_memberships (course_id, user_id, lti_user_lineitem_sub) VALUES ($1, $2, $3)
     ON CONFLICT (course_id, user_id) DO UPDATE SET lti_user_lineitem_sub = EXCLUDED.lti_user_lineitem_sub`,
    [course_id, user_id, sub]
  );

  const code = randomUUID();
  sessionCodeStore.set(code, {
    expires: Date.now() + 60_000,
    user: { id: user_id, display_name, role, course_id, class_code: context.id },
  });

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  res.redirect(`${frontendUrl}/?launch=${code}`);
});
