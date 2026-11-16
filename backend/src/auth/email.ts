import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { createAppSession } from './session.js';
import { authRateLimit } from './rateLimit.js';

const router = Router();
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

async function sendMagicLink(email: string, url: string) {
    if (config.resendApiKey) {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10_000),
            body: JSON.stringify({
                from: config.emailFrom,
                to: [email],
                subject: 'Your Agora sign-in link',
                html: `<p>Use this one-time link to sign in to Agora:</p><p><a href="${url}">Sign in to Agora</a></p><p>This link expires in 15 minutes. If you did not request it, ignore this email.</p>`,
            }),
        });
        if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
    } else if (config.nodeEnv !== 'production') {
        // Development-only convenience. Never log or return a token in production.
        console.info(`[DEV EMAIL] Magic link for ${email}: ${url}`);
    } else {
        throw new Error('Email delivery is not configured. Set RESEND_API_KEY.');
    }
}

router.post('/auth/email/request', authRateLimit(5), async (req, res, next) => {
    try {
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
        // Only pre-provisioned accounts can request sign-in. This endpoint never creates enrollments.
        const { rows } = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email]);
        // Return the same response whether the account exists or not to reduce account enumeration.
        if (rows[0]) {
            const rawToken = randomBytes(32).toString('base64url');
            await pool.query(
                `INSERT INTO email_login_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '15 minutes')`,
                [rows[0].id, sha256(rawToken)],
            );
            const link = `${config.frontendUrl}/auth/verify?token=${encodeURIComponent(rawToken)}`;
            await sendMagicLink(email, link);
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ok: true, message: 'If the account is eligible, a sign-in link has been sent.' });
    } catch (error) { next(error); }
});

router.post('/auth/email/verify', authRateLimit(10), async (req, res, next) => {
    try {
        const token = String(req.body?.token ?? '');
        if (token.length < 32 || token.length > 256) return res.status(400).json({ error: 'Invalid or expired sign-in link' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `UPDATE email_login_tokens SET consumed_at = now()
          WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
          RETURNING user_id`, [sha256(token)],
            );
            if (!rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Invalid or expired sign-in link' }); }
            await client.query('UPDATE users SET email_verified=true WHERE id=$1', [rows[0].user_id]);
            await client.query('COMMIT');
            const csrf_token = await createAppSession(rows[0].user_id, res);
            res.setHeader('Cache-Control', 'no-store');
            res.json({ ok: true, csrf_token });
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    } catch (error) { next(error); }
});

export { router as emailAuthRouter };
