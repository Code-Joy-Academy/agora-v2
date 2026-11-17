import { pool } from '../db/pool.js';

/** Periodic cleanup for expired bearer credentials and idempotency receipts. */
export function startAuthMaintenance(): NodeJS.Timeout {
    const timer = setInterval(() => {
        void (async () => {
            await pool.query('DELETE FROM auth_sessions WHERE expires_at < now() OR revoked_at < now() - interval \'30 days\'');
            await pool.query('DELETE FROM email_login_tokens WHERE expires_at < now() OR used_at < now() - interval \'1 day\'');
            await pool.query('DELETE FROM lti_login_states WHERE expires_at < now()');
            await pool.query('DELETE FROM lti_launch_codes WHERE expires_at < now()');
            await pool.query('DELETE FROM session_turn_requests WHERE created_at < now() - interval \'30 days\'');
        })().catch((error) => console.error('Auth maintenance failed:', error));
    }, 60 * 60_000);
    timer.unref();
    return timer;
}
