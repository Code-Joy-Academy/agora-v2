import { pool } from '../db/pool.js';
import { MOCK_PLATFORM } from './platformConfig.js';
import { isKnownPack } from '../curriculum/curriculumLoader.js';

export async function bootstrapMockPlatform(baseUrl: string) {
    const existing = await pool.query(`SELECT id FROM institutions WHERE name = 'Agora Dev Sandbox' LIMIT 1`);
    const institution_id = existing.rows[0]?.id
        ?? (await pool.query(`INSERT INTO institutions (name) VALUES ('Agora Dev Sandbox') RETURNING id`)).rows[0].id;

    const { rows: [platform] } = await pool.query(
        `INSERT INTO lti_platforms (institution_id, issuer, client_id, platform_auth_login_url, platform_auth_token_url, platform_jwks_url, is_mock)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (issuer, client_id) DO UPDATE SET
       platform_auth_login_url = EXCLUDED.platform_auth_login_url,
       platform_auth_token_url = EXCLUDED.platform_auth_token_url,
       platform_jwks_url = EXCLUDED.platform_jwks_url
     RETURNING id`,
        [
            institution_id,
            MOCK_PLATFORM.issuer,
            MOCK_PLATFORM.client_id,
            MOCK_PLATFORM.platform_auth_login_url(baseUrl),
            MOCK_PLATFORM.platform_auth_token_url(baseUrl),
            MOCK_PLATFORM.platform_jwks_url(baseUrl),
        ]
    );

    // Dev only: MOCK_CURRICULUM_MAPPINGS="class-code:pack-id,..." pre-approves mock LMS courses,
    // since launches for unmapped contexts are rejected.
    const { rows: [deployment] } = await pool.query(
        `INSERT INTO lti_deployments (platform_id, deployment_id) VALUES ($1, $2)
     ON CONFLICT (platform_id, deployment_id) DO UPDATE SET deployment_id = EXCLUDED.deployment_id RETURNING id`,
        [platform.id, MOCK_PLATFORM.deployment_id],
    );
    for (const entry of (process.env.MOCK_CURRICULUM_MAPPINGS ?? '').split(',').filter(Boolean)) {
        const [context, pack] = entry.split(':').map((s) => s.trim());
        if (!isKnownPack(pack)) { console.warn(`MOCK_CURRICULUM_MAPPINGS: unknown pack "${pack}"`); continue; }
        await pool.query(
            `INSERT INTO institution_curriculum_mappings (institution_id, deployment_id, lti_context_id, curriculum_pack_id)
       SELECT institution_id, $1, $2, $3 FROM lti_platforms WHERE id = $4
       ON CONFLICT (deployment_id, lti_context_id) DO UPDATE SET curriculum_pack_id = EXCLUDED.curriculum_pack_id, active = true`,
            [deployment.id, context, pack, platform.id],
        );
    }
}
