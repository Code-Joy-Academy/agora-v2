BEGIN;

-- Remove the previous global student/node uniqueness rule.
ALTER TABLE mastery_states
DROP CONSTRAINT IF EXISTS mastery_states_student_id_node_id_key;

-- A student's mastery is now scoped to a specific course.
ALTER TABLE mastery_states
    ADD CONSTRAINT mastery_states_student_course_node_key
        UNIQUE (student_id, course_id, node_id);

-- Protect the integrity of mastery values.
ALTER TABLE mastery_states
    ADD CONSTRAINT mastery_states_probability_check
        CHECK (p_mastery >= 0 AND p_mastery <= 1);

ALTER TABLE mastery_states
    ADD CONSTRAINT mastery_states_counts_check
        CHECK (
            correct_count >= 0
                AND incorrect_count >= 0
                AND time_on_task_seconds >= 0
            );

CREATE INDEX IF NOT EXISTS mastery_states_course_student_idx
    ON mastery_states (course_id, student_id);

COMMIT;