import { pool } from '../db/pool.js';
import { MOCK_PLATFORM } from './platformConfig.js';

export async function bootstrapMockPlatform(baseUrl: string) {
  const existing = await pool.query(`SELECT id FROM institutions WHERE name = 'Agora Dev Sandbox' LIMIT 1`);
  const institution_id = existing.rows[0]?.id
    ?? (await pool.query(`INSERT INTO institutions (name) VALUES ('Agora Dev Sandbox') RETURNING id`)).rows[0].id;

  await pool.query(
    `INSERT INTO lti_platforms (institution_id, issuer, client_id, platform_auth_login_url, platform_auth_token_url, platform_jwks_url, is_mock)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (issuer, client_id) DO UPDATE SET
       platform_auth_login_url = EXCLUDED.platform_auth_login_url,
       platform_auth_token_url = EXCLUDED.platform_auth_token_url,
       platform_jwks_url = EXCLUDED.platform_jwks_url`,
    [
      institution_id,
      MOCK_PLATFORM.issuer,
      MOCK_PLATFORM.client_id,
      MOCK_PLATFORM.platform_auth_login_url(baseUrl),
      MOCK_PLATFORM.platform_auth_token_url(baseUrl),
      MOCK_PLATFORM.platform_jwks_url(baseUrl),
    ]
  );
}
