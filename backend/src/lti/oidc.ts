import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';

export const oidcLoginStore = new Map<string, { nonce: string; target_link_uri: string; login_hint: string; expires: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of oidcLoginStore) if (v.expires < now) oidcLoginStore.delete(k);
}, 60_000).unref();

export const loginRouter = Router();

loginRouter.get('/lti/login', async (req, res) => {
  const { iss, login_hint, target_link_uri, client_id, lti_message_hint } = req.query as Record<string, string>;

  const { rows } = await pool.query(
    'SELECT * FROM lti_platforms WHERE issuer = $1 AND client_id = $2',
    [iss, client_id]
  );
  const platform = rows[0];
  if (!platform) return res.status(400).send('Unregistered platform — no lti_platforms row for this iss/client_id.');

  const state = randomUUID();
  const nonce = randomUUID();
  oidcLoginStore.set(state, { nonce, target_link_uri, login_hint, expires: Date.now() + 5 * 60_000 });

  const params = new URLSearchParams({
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id,
    redirect_uri: target_link_uri,
    login_hint,
    state,
    nonce,
  });
  if (lti_message_hint) params.set('lti_message_hint', lti_message_hint);

  res.redirect(`${platform.platform_auth_login_url}?${params.toString()}`);
});
