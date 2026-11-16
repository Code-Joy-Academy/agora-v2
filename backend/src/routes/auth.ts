
import { Router } from 'express';
import {
    clearSessionCookie,
    destroyAppSession,
    issueCsrfToken,
    sessionTokenFromRequest,
} from '../auth/session.js';
import { requireAuth } from '../auth/middleware.js';

export const authRouter = Router();

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user and their course memberships.
 */
authRouter.get('/auth/me', requireAuth, (req, res) => {
    const auth = req.auth!;

    return res.json({
        id: auth.userId,
        display_name: auth.displayName,
        role: auth.role,
        email: auth.email,
        courses: auth.courses,
        course_roles: auth.courseRoles,
    });
});

/**
 * GET /api/auth/csrf
 *
 * Issues a CSRF token for the current authenticated session.
 */
authRouter.get('/auth/csrf', requireAuth, (_req, res) => {
    const csrf_token = issueCsrfToken(res);

    return res.json({ csrf_token });
});

/**
 * POST /api/auth/logout
 *
 * Revokes the current session and clears its cookies.
 */
authRouter.post('/auth/logout', requireAuth, async (req, res, next) => {
    try {
        const token = sessionTokenFromRequest(req);

        await destroyAppSession(token);

        clearSessionCookie(res);

        return res.json({ success: true });
    } catch (error) {
        return next(error);
    }
});
