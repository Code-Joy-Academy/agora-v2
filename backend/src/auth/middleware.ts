import type { NextFunction, Request, Response } from 'express';
import { resolvePrincipal, sessionTokenFromRequest, type AuthPrincipal } from './session.js';
import { config } from '../config/env.js';

declare global {
    namespace Express {
        interface Request { auth?: AuthPrincipal }
    }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const principal = await resolvePrincipal(sessionTokenFromRequest(req));
        if (!principal) return res.status(401).json({ error: 'Authentication required' });
        req.auth = principal;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            let csrfCookie: string | undefined;
            for (const part of (req.headers.cookie ?? '').split(';')) {
                const [name, ...value] = part.trim().split('=');
                if (name === 'agora_csrf') csrfCookie = decodeURIComponent(value.join('='));
            }
            const csrfHeader = req.header('x-agora-csrf');
            const origin = req.header('origin');
            const allowedOrigins = config.corsOrigins.split(',').map((value) => value.trim()).filter(Boolean);
            if ((origin && !allowedOrigins.includes(origin)) || !csrfCookie || csrfHeader !== csrfCookie) {
                return res.status(403).json({ error: 'CSRF validation failed' });
            }
        }
        next();
    } catch (error) {
        next(error);
    }
}

export function requireRole(...roles: Array<'Teacher' | 'Student'>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const courseId = req.params.id ?? req.params.course_id ?? req.body?.course_id;
        const effectiveRole = courseId ? req.auth?.courseRoles[courseId] : req.auth?.role;
        if (!req.auth || !effectiveRole || !roles.includes(effectiveRole)) {
            return res.status(403).json({ error: 'Insufficient role' });
        }
        next();
    };
}

export function requireCourseMember(req: Request, res: Response, next: NextFunction) {
    const courseId = req.params.id ?? req.params.course_id ?? req.body?.course_id;
    if (!req.auth || !req.auth.courses.includes(courseId)) {
        return res.status(403).json({ error: 'You are not enrolled in this course' });
    }
    next();
}
