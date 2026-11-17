import { createClient } from 'redis';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';

// Shared fixed-window counter so limits hold across restarts and backend instances.
const redis = config.redisUrl ? createClient({ url: config.redisUrl, disableOfflineQueue: true }) : null;
redis?.on('error', (e) => console.error('[rate-limit] Redis error:', (e as any).code ?? (e as any).errors?.[0]?.code ?? e));

const WINDOW_SCRIPT = `local c=redis.call('INCR',KEYS[1]) if c==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end return {c,redis.call('PTTL',KEYS[1])}`;
const devBuckets = new Map<string, { count: number; resetAt: number }>(); // local development only

export async function connectRateLimitStore() {
    if (!redis) { if (config.nodeEnv === 'production') throw new Error('REDIS_URL is required in production'); return; }
    await Promise.race([
        redis.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Redis connect timed out - check REDIS_URL')), 10_000)),
    ]);
}

export async function closeRateLimitStore(): Promise<void> {
    if (redis?.isOpen) await redis.quit();
}

async function hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
    if (redis) {
        const [count, ttl] = (await redis.eval(WINDOW_SCRIPT, { keys: [key], arguments: [String(windowMs)] })) as [number, number];
        return { count, ttlMs: ttl > 0 ? ttl : windowMs };
    }
    const now = Date.now();
    const bucket = devBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        devBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return { count: 1, ttlMs: windowMs };
    }
    return { count: ++bucket.count, ttlMs: bucket.resetAt - now };
}

/** Per-IP, per-route limiter. Fails closed (503) when the store is unavailable. */
export function authRateLimit(maxRequests = 5, windowMs = 15 * 60_000) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const {count, ttlMs} = await hit(`rl:${req.baseUrl}${req.path}:${req.ip}`, windowMs);
            if (count <= maxRequests) return next();
            res.setHeader('Retry-After', Math.ceil(ttlMs / 1000));
            res.status(429).json({error: 'Too many requests. Try again later.'});
        } catch (error) {
            console.error('[rate-limit] store unavailable, failing closed:', error);
            res.status(503).json({error: 'Service temporarily unavailable. Try again shortly.'});
        }
    };
}