import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';
import { asyncRoute } from '../routes/asyncRoute.js';

export const loginRouter = Router();

loginRouter.get('/lti/login', asyncRoute(async (req, res) => {
  const { iss, login_hint, target_link_uri, client_id, lti_message_hint } = req.query as Record<string, string>;
  if (!iss || !client_id || !login_hint || !target_link_uri) return res.status(400).send('Missing LTI login parameters.');

  const { rows } = await pool.query('SELECT id, platform_auth_login_url FROM lti_platforms WHERE issuer = $1 AND client_id = $2', [iss, client_id]);
  const platform = rows[0];
  if (!platform) return res.status(400).send('Unregistered platform — no lti_platforms row for this iss/client_id.');

  const state = randomUUID();
  const nonce = randomUUID();
  await pool.query(
      `INSERT INTO lti_login_states (state, nonce, platform_id, target_link_uri, login_hint, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '5 minutes')`,
      [state, nonce, platform.id, target_link_uri, login_hint],
  );

  const params = new URLSearchParams({
    scope: 'openid', response_type: 'id_token', response_mode: 'form_post', prompt: 'none',
    client_id, redirect_uri: target_link_uri, login_hint, state, nonce,
  });
  if (lti_message_hint) params.set('lti_message_hint', lti_message_hint);

  res.redirect(`${platform.platform_auth_login_url}?${params.toString()}`);
}));
