import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';

export interface AuthPrincipal {
    userId: string;
    institutionId: string;
    displayName: string;
    role: 'Teacher' | 'Student';
    email: string | null;
    courses: string[];
    courseRoles: Record<string, 'Teacher' | 'Student'>;
}

export const SESSION_COOKIE = 'agora_session';
export const CSRF_COOKIE = 'agora_csrf';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieSecure = config.nodeEnv === 'production' || config.sessionCookieSecure;

export function issueCsrfToken(res: Response, expiresAt = new Date(Date.now() + SESSION_TTL_MS)): string {
    const csrfToken = randomBytes(24).toString('base64url');
    // HttpOnly cookie is readable by the API; the value is also returned once in
    // the JSON response so a frontend on a separate host can set the CSRF header.
    res.cookie(CSRF_COOKIE, csrfToken, {
        httpOnly: true, secure: cookieSecure, sameSite: config.cookieSameSite, path: '/', expires: expiresAt,
    });
    return csrfToken;
}

export async function createAppSession(
    userId: string,
    res: Response,
): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await pool.query(
        `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, hash(token), expiresAt],
    );

    return setAppSessionCookies(res, token, expiresAt);
}

export async function destroyAppSession(
    token: string | undefined,
): Promise<void> {
    if (!token) return;

    await pool.query(
        `UPDATE auth_sessions
        SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL`,
        [hash(token)],
    );
}

export async function resolvePrincipal(token: string | undefined): Promise<AuthPrincipal | null> {
    if (!token) return null;
    const { rows } = await pool.query(
        `SELECT u.id, u.institution_id, u.display_name, u.role, u.email,
            COALESCE(array_agg(cm.course_id) FILTER (WHERE cm.course_id IS NOT NULL), '{}') AS courses,
            COALESCE(jsonb_object_agg(cm.course_id, cm.role) FILTER (WHERE cm.course_id IS NOT NULL), '{}'::jsonb) AS course_roles
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN course_memberships cm ON cm.user_id = u.id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      GROUP BY u.id`,
        [hash(token)],
    );
    const row = rows[0];
    if (!row) return null;
    return {
        userId: row.id,
        institutionId: row.institution_id,
        displayName: row.display_name,
        role: row.role,
        email: row.email ?? null,
        courses: row.courses ?? [],
        courseRoles: row.course_roles ?? {},
    };
}

export function clearSessionCookie(res: Response): void {
    res.clearCookie(CSRF_COOKIE, { httpOnly: true, secure: cookieSecure, sameSite: config.cookieSameSite, path: '/' });
    res.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: config.cookieSameSite,
        path: '/',
    });
}

export function sessionTokenFromRequest(req: Request): string | undefined {
    const raw = req.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
    }
    return undefined;
}


// Addtion
export function setAppSessionCookies(
    res: Response,
    token: string,
    expiresAt: Date,
): string {
    const csrfToken = issueCsrfToken(res, expiresAt);

    res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: config.cookieSameSite,
        path: '/',
        expires: expiresAt,
    });

    return csrfToken;
}