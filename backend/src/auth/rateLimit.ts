import type { NextFunction, Request, Response } from 'express';

/** Small per-process limiter for sensitive auth endpoints. Use a shared store
 * (Redis/API gateway) when running multiple backend instances. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function authRateLimit(maxRequests = 5, windowMs = 15 * 60_000) {
    return (req: Request, res: Response, next: NextFunction) => {
        const key = `${req.ip}:${req.path}`;
        const now = Date.now();
        const current = buckets.get(key);
        if (buckets.size > 5000) {
            for (const [bucketKey, bucket] of buckets) {
                if (bucket.resetAt <= now) buckets.delete(bucketKey);
            }
        }
        if (!current || current.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        current.count += 1;
        if (current.count > maxRequests) {
            res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
            return res.status(429).json({ error: 'Too many requests. Try again later.' });
        }
        next();
    };
}
