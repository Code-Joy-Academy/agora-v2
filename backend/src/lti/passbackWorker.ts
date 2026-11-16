import { pool } from '../db/pool.js';
import { passbackMastery } from './ags.js';

let running = false;

/**
 * Durable AGS outbox worker. A failed LMS request is retried with exponential
 * backoff; tutoring requests never wait for the LMS gradebook.
 */
export async function processPassbackJobs(batchSize = 5): Promise<void> {
    if (running) return;
    running = true;
    try {
        const client = await pool.connect();
        let jobs: Array<{ id: string; course_id: string; student_id: string; node_id: string | null; score: number }> = [];
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `SELECT id,course_id,student_id,node_id,score FROM lms_passback_jobs
          WHERE (status IN ('pending','failed') AND next_attempt_at <= now())
             OR (status='processing' AND locked_at < now() - interval '5 minutes')
          ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [batchSize],
            );
            jobs = rows;
            if (jobs.length) {
                await client.query(
                    `UPDATE lms_passback_jobs SET status='processing',locked_at=now(),updated_at=now()
            WHERE id = ANY($1::uuid[])`, [jobs.map((j) => j.id)],
                );
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally { client.release(); }

        for (const job of jobs) {
            try {
                if (!job.node_id) {
                    await pool.query(`UPDATE lms_passback_jobs SET status='failed',attempts=attempts+1,locked_at=NULL,last_error='Curriculum node was deleted',updated_at=now() WHERE id=$1`, [job.id]);
                    continue;
                }
                const result = await passbackMastery(job.course_id, job.student_id, job.node_id, Number(job.score));
                if (result.sent) {
                    await pool.query(`UPDATE lms_passback_jobs SET status='sent',attempts=attempts+1,locked_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1`, [job.id]);
                } else {
                    await pool.query(`UPDATE lms_passback_jobs SET status='failed',attempts=attempts+1,locked_at=NULL,last_error=$2,next_attempt_at=now()+LEAST(interval '6 hours', interval '30 seconds' * power(2, LEAST(attempts,10))),updated_at=now() WHERE id=$1`, [job.id, ('reason' in result ? result.reason : 'Passback not sent')]);
                }
            } catch (error) {
                await pool.query(
                    `UPDATE lms_passback_jobs SET status='failed',attempts=attempts+1,locked_at=NULL,
             last_error=$2,next_attempt_at=now()+LEAST(interval '6 hours', interval '30 seconds' * power(2, LEAST(attempts,10))),updated_at=now()
           WHERE id=$1`, [job.id, (error as Error).message.slice(0, 1000)],
                );
            }
        }
    } finally { running = false; }
}

export function startPassbackWorker(): NodeJS.Timeout {
    const timer = setInterval(() => { void processPassbackJobs().catch((error) => console.error('Passback worker failed:', error)); }, 15_000);
    timer.unref();
    return timer;
}
