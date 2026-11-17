import { pool } from '../db/pool.js';
import { passbackCourseMastery } from './ags.js';

let running = false;

const BACKOFF = `now()+LEAST(interval '6 hours', interval '30 seconds' * power(2, LEAST(attempts,10)))`;

/**
 * Durable AGS outbox worker. Each job means "recalculate this student's course grade and send it";
 * the score is computed at send time, so a job is never stale. Failed requests retry with
 * exponential backoff and tutoring requests never wait for the LMS gradebook.
 */
export async function processPassbackJobs(batchSize = 5): Promise<void> {
    if (running) return;
    running = true;
    try {
        const client = await pool.connect();
        let jobs: Array<{ id: string; course_id: string; student_id: string }> = [];
        try {
            await client.query('BEGIN');
            ({ rows: jobs } = await client.query(
                `SELECT id, course_id, student_id FROM lms_passback_jobs
          WHERE (status IN ('pending','failed') AND next_attempt_at <= now())
             OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
          ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [batchSize]));
            if (jobs.length) {
                await client.query(`UPDATE lms_passback_jobs SET status='processing', locked_at=now(), updated_at=now() WHERE id = ANY($1::uuid[])`, [jobs.map((j) => j.id)]);
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally { client.release(); }

        for (const job of jobs) {
            try {
                const result = await passbackCourseMastery(job.course_id, job.student_id);
                if (result.sent) {
                    await pool.query(`UPDATE lms_passback_jobs SET status='sent', attempts=attempts+1, locked_at=NULL, last_error=NULL, score=$2, updated_at=now() WHERE id=$1`, [job.id, result.score]);
                } else {
                    await fail(job.id, ('reason' in result && result.reason) || 'LMS rejected the score');
                }
            } catch (error) {
                await fail(job.id, (error as Error).message.slice(0, 1000));
            }
        }
    } finally { running = false; }
}

const fail = (id: string, reason: string) => pool.query(
    `UPDATE lms_passback_jobs SET status='failed', attempts=attempts+1, locked_at=NULL, last_error=$2, next_attempt_at=${BACKOFF}, updated_at=now() WHERE id=$1`,
    [id, reason],
);

export function startPassbackWorker(): NodeJS.Timeout {
    const timer = setInterval(() => { void processPassbackJobs().catch((error) => console.error('Passback worker failed:', error)); }, 15_000);
    timer.unref();
    return timer;
}
