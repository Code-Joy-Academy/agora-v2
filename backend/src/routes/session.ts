
import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';
import { setAppSessionCookies } from '../auth/session.js';

export const sessionRouter = Router();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hash = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

/**
 * POST /api/session/exchange
 *
 * Exchanges a single-use LTI launch code for an Agora browser session.
 */
sessionRouter.post('/session/exchange', async (req, res, next) => {
  const { code } = req.body as { code?: string };

  if (!code || typeof code !== 'string' || code.length > 512) {
    return res.status(400).json({
      error: 'Invalid launch code',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Atomically consume the launch code.
    const result = await client.query(
        `DELETE FROM lti_launch_codes
         WHERE code_hash = $1
           AND expires_at > NOW()
           RETURNING user_id`,
        [hash(code)],
    );

    if (result.rowCount !== 1) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: 'Invalid or expired launch code',
      });
    }

    const userId = result.rows[0].user_id;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await client.query(
        `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, hash(token), expiresAt],
    );

    await client.query('COMMIT');

    const csrf_token = setAppSessionCookies(
        res,
        token,
        expiresAt,
    );

    return res.json({ csrf_token });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

/**
 * GET /api/auth/demo?role=Student
 *
 * Creates a local demo user and establishes a normal Agora session.
 * This endpoint must never be enabled in production.
 */
sessionRouter.get('/auth/demo', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const role =
      req.query.role === 'Teacher' ? 'Teacher' : 'Student';

  const displayName =
      role === 'Teacher' ? 'Dr. Jenkins' : 'Marcus Chen';

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find or create the sandbox institution.
    const institutionResult = await client.query(
        `INSERT INTO institutions (name)
         VALUES ('Agora Local Sandbox')
           ON CONFLICT DO NOTHING
       RETURNING id`,
    );

    let institutionId = institutionResult.rows[0]?.id;

    if (!institutionId) {
      const existing = await client.query(
          `SELECT id
           FROM institutions
           WHERE name = 'Agora Local Sandbox'
             LIMIT 1`,
      );

      institutionId = existing.rows[0]?.id;
    }

    if (!institutionId) {
      throw new Error('Could not initialize sandbox institution');
    }

    // Find or create the sandbox course.
    let courseResult = await client.query(
        `SELECT id, title, curriculum_pack_id
         FROM courses
         WHERE institution_id = $1
           LIMIT 1`,
        [institutionId],
    );

    let course = courseResult.rows[0];

    if (!course) {
      const created = await client.query(
          `INSERT INTO courses (
            institution_id,
            title,
            curriculum_pack_id
          )
           VALUES ($1, $2, $3)
             RETURNING id, title, curriculum_pack_id`,
          [
            institutionId,
            'Grade 9 Math & Stage 8 English',
            'cambridge-math-stage-9',
          ],
      );

      course = created.rows[0];
    }

    // Find or create the demo user.
    let userResult = await client.query(
        `SELECT id, display_name, role
         FROM users
        WHERE institution_id = $1
          AND role = $2
          AND display_name = $3
        LIMIT 1`,
        [institutionId, role, displayName],
    );

    let user = userResult.rows[0];

    if (!user) {
      const created = await client.query(
          `INSERT INTO users (
           institution_id,
           display_name,
           role
         )
         VALUES ($1, $2, $3)
         RETURNING id, display_name, role`,
          [institutionId, displayName, role],
      );

      user = created.rows[0];
    }

    // Ensure the user belongs to the sandbox course.
    await client.query(
        `INSERT INTO course_memberships (
         course_id,
         user_id,
         role
       )
       VALUES ($1, $2, $3)
       ON CONFLICT (course_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
        [course.id, user.id, role],
    );

    // Create the authenticated session in the same transaction.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await client.query(
        `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, hash(token), expiresAt],
    );

    await client.query('COMMIT');

    const csrf_token = setAppSessionCookies(
        res,
        token,
        expiresAt,
    );

    return res.json({
      course,
      active_user: {
        id: user.id,
        display_name: user.display_name,
        role,
        course_id: course.id,
        class_code: course.title,
      },
      csrf_token,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});
