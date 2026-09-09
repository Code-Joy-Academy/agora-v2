// import { Router } from 'express';
// import { sessionCodeStore } from '../lti/launch.js';

// export const sessionRouter = Router();

// sessionRouter.post('/session/exchange', (req, res) => {
//   const { code } = req.body as { code: string };
//   const entry = sessionCodeStore.get(code);
//   if (!entry) return res.status(400).json({ error: 'invalid or expired launch code' });
//   sessionCodeStore.delete(code); // single use
//   res.json(entry.user);
// });

// backend/src/routes/session.ts
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { sessionCodeStore } from '../lti/launch.js';

export const sessionRouter = Router();

// --- ADD THIS ENDPOINT ---
sessionRouter.get('/auth/demo', async (_req, res) => {
  try {
    // 1. Fetch an existing course or create a fallback sandbox course
    let { rows: courses } = await pool.query(
      'SELECT id, title, curriculum_pack_id FROM courses LIMIT 1'
    );
    let course = courses[0];

    if (!course) {
      const { rows: institutions } = await pool.query(
        "INSERT INTO institutions (name) VALUES ('Agora Local Sandbox') RETURNING id"
      );
      const { rows: newCourses } = await pool.query(
        `INSERT INTO courses (institution_id, title, curriculum_pack_id)
         VALUES ($1, 'Grade 9 Math & Stage 8 English', 'cambridge-math-stage-9')
         RETURNING id, title, curriculum_pack_id`,
        [institutions[0].id]
      );
      course = newCourses[0];
    }

    // 2. Fetch or create a demo student
    let { rows: students } = await pool.query(
      "SELECT id, display_name, role FROM users WHERE role = 'Student' LIMIT 1"
    );
    let student = students[0];

    if (!student) {
      const { rows: institutions } = await pool.query('SELECT id FROM institutions LIMIT 1');
      const { rows: newStudents } = await pool.query(
        `INSERT INTO users (institution_id, display_name, role)
         VALUES ($1, 'Marcus Chen', 'Student')
         RETURNING id, display_name, role`,
        [institutions[0].id]
      );
      student = newStudents[0];
    }

    // 3. Fetch or create a demo teacher
    let { rows: teachers } = await pool.query(
      "SELECT id, display_name, role FROM users WHERE role = 'Teacher' LIMIT 1"
    );
    let teacher = teachers[0];

    if (!teacher) {
      const { rows: institutions } = await pool.query('SELECT id FROM institutions LIMIT 1');
      const { rows: newTeachers } = await pool.query(
        `INSERT INTO users (institution_id, display_name, role)
         VALUES ($1, 'Dr. Jenkins', 'Teacher')
         RETURNING id, display_name, role`,
        [institutions[0].id]
      );
      teacher = newTeachers[0];
    }

    res.json({
      course,
      student: {
        ...student,
        course_id: course.id,
        class_code: course.title,
      },
      teacher: {
        ...teacher,
        course_id: course.id,
        class_code: course.title,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Existing exchange endpoint
sessionRouter.post('/session/exchange', (req, res) => {
  const { code } = req.body as { code: string };
  const entry = sessionCodeStore.get(code);
  if (!entry) return res.status(400).json({ error: 'invalid or expired launch code' });
  sessionCodeStore.delete(code);
  res.json(entry.user);
});