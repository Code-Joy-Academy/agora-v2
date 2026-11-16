
import { Router } from 'express';
import {
    createHash,
    randomBytes,
} from 'node:crypto';

import { pool } from '../db/pool.js';
import { setAppSessionCookies } from '../auth/session.js';
import {sendLoginEmail} from "../services/email.js";

export const emailAuthRouter = Router();

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hash = (value: string): string =>
    createHash('sha256')
        .update(value)
        .digest('hex');

const genericResponse = {
    ok: true,
    message:
        'If an eligible account exists for that email, a sign-in link has been sent.',
};

// -----------------------------------------------------------------------------
// POST /auth/email/request
// -----------------------------------------------------------------------------

emailAuthRouter.post('/auth/email/request', async (req, res, next) => {
    try {
        const email = String(req.body?.email ?? '')
            .trim()
            .toLowerCase();

        if (
            !email ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return res.status(400).json({
                error: 'Please provide a valid email address.',
            });
        }

        // Only issue login links to registered Agora accounts.
        const result = await pool.query<{ id: string }>(
            `
      SELECT id
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
            [email],
        );

        const user = result.rows[0];

        // Do not disclose whether an account exists.
        if (!user) {
            return res.status(200).json(genericResponse);
        }

        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = hash(rawToken);

        const expiresAt = new Date(
            Date.now() + LOGIN_TOKEN_TTL_MS,
        );

        // Invalidate earlier unused links for this account.
        await pool.query(
            `
      UPDATE email_login_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
      `,
            [user.id],
        );

        await pool.query(
            `
      INSERT INTO email_login_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
      `,
            [user.id, tokenHash, expiresAt],
        );

        try {
            await sendLoginEmail({
                to: email,
                token: rawToken,
            });
        } catch (emailError) {
            // Do not leave a usable token behind if email delivery fails.
            await pool.query(
                `
        DELETE FROM email_login_tokens
        WHERE token_hash = $1
        `,
                [tokenHash],
            );

            throw emailError;
        }

        return res.status(200).json(genericResponse);
    } catch (error) {
        next(error);
    }
});

// -----------------------------------------------------------------------------
// POST /auth/email/verify
// -----------------------------------------------------------------------------

emailAuthRouter.post('/auth/email/verify', async (req, res, next) => {
    const rawToken = String(req.body?.token ?? '');

    if (!rawToken || rawToken.length > 256) {
        return res.status(400).json({
            error: 'This sign-in link is invalid or has expired.',
        });
    }

    const tokenHash = hash(rawToken);
    const sessionToken = randomBytes(32).toString('base64url');
    const sessionExpiresAt = new Date(
        Date.now() + SESSION_TTL_MS,
    );

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lock the token row so concurrent requests cannot consume it twice.
        const tokenResult = await client.query<{ user_id: string }>(
            `
      SELECT user_id
      FROM email_login_tokens
      WHERE token_hash = $1
        AND expires_at > NOW()
        AND used_at IS NULL
      FOR UPDATE
      `,
            [tokenHash],
        );

        const loginToken = tokenResult.rows[0];

        if (!loginToken) {
            await client.query('ROLLBACK');

            return res.status(400).json({
                error: 'This sign-in link is invalid, expired, or has already been used.',
            });
        }

        await client.query(
            `
      UPDATE email_login_tokens
      SET used_at = NOW()
      WHERE token_hash = $1
      `,
            [tokenHash],
        );

        // Successful possession of the registered email link verifies the email.
        await client.query(
            `
      UPDATE users
      SET email_verified = TRUE
      WHERE id = $1
      `,
            [loginToken.user_id],
        );

        await client.query(
            `
      INSERT INTO auth_sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
      `,
            [
                loginToken.user_id,
                hash(sessionToken),
                sessionExpiresAt,
            ],
        );

        await client.query('COMMIT');

        // Set cookies only after the database transaction succeeds.
        const csrfToken = setAppSessionCookies(
            res,
            sessionToken,
            sessionExpiresAt,
        );

        return res.status(200).json({
            ok: true,
            csrf_token: csrfToken,
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        next(error);
    } finally {
        client.release();
    }
});
