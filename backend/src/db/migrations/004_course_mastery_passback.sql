-- AGS passback is now one course-level grade per student, recalculated at send time.

ALTER TABLE lms_passback_jobs ALTER COLUMN score DROP NOT NULL;

-- Keep only the newest open job per student/course; it supersedes older node-level jobs.
DELETE FROM lms_passback_jobs j
    USING lms_passback_jobs newer
WHERE j.status IN ('pending','failed') AND newer.status IN ('pending','failed')
  AND j.course_id = newer.course_id AND j.student_id = newer.student_id
  AND (j.created_at, j.id) < (newer.created_at, newer.id);

UPDATE lms_passback_jobs SET node_id = NULL, score = NULL WHERE status IN ('pending','failed');

CREATE UNIQUE INDEX IF NOT EXISTS lms_passback_jobs_open_uq
    ON lms_passback_jobs (course_id, student_id) WHERE status IN ('pending','failed');
