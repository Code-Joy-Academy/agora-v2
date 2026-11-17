-- Institution administrators and the curriculum they assign to each LMS course.

CREATE TABLE IF NOT EXISTS institution_admins (
                                                  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, institution_id)
    );

CREATE TABLE IF NOT EXISTS institution_curriculum_mappings (
                                                               id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    deployment_id UUID NOT NULL REFERENCES lti_deployments(id) ON DELETE CASCADE,
    lti_context_id TEXT NOT NULL CHECK (length(lti_context_id) BETWEEN 1 AND 255),
    curriculum_pack_id TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (deployment_id, lti_context_id)
    );
CREATE INDEX IF NOT EXISTS institution_curriculum_mappings_inst_idx
    ON institution_curriculum_mappings (institution_id);
