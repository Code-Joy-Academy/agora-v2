-- Agora v2: persistent identity, browser sessions, LTI state, and pass back outbox.
-- Apply after backing up the local database. This migration is safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- An email address is unique for direct password less sign-in. Existing duplicates
-- must be resolved before this index is created; the migration fails rather than
-- silently choosing the wrong account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (lower(email)) WHERE email IS NOT NULL;

ALTER TABLE course_memberships ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Student';
UPDATE course_memberships cm SET role=u.role FROM users u WHERE u.id=cm.user_id;
ALTER TABLE course_memberships DROP CONSTRAINT IF EXISTS course_memberships_role_check;
ALTER TABLE course_memberships ADD CONSTRAINT course_memberships_role_check CHECK (role IN ('Teacher','Student'));

CREATE TABLE IF NOT EXISTS external_identities (
                                                   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, issuer, client_id, subject)
    );
CREATE INDEX IF NOT EXISTS external_identities_user_idx ON external_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
                                             id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
    );
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS email_login_tokens (
                                                  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
    );
CREATE INDEX IF NOT EXISTS email_login_tokens_expiry_idx ON email_login_tokens(expires_at);

CREATE TABLE IF NOT EXISTS lti_login_states (
                                                state TEXT PRIMARY KEY,
                                                nonce TEXT NOT NULL,
                                                platform_id UUID NOT NULL REFERENCES lti_platforms(id) ON DELETE CASCADE,
    target_link_uri TEXT NOT NULL,
    login_hint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
    );
CREATE INDEX IF NOT EXISTS lti_login_states_expiry_idx ON lti_login_states(expires_at);

CREATE TABLE IF NOT EXISTS lti_launch_codes (
                                                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
    );
CREATE INDEX IF NOT EXISTS lti_launch_codes_expiry_idx ON lti_launch_codes(expires_at);

CREATE TABLE IF NOT EXISTS lms_passback_jobs (
                                                 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id TEXT REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
    score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE INDEX IF NOT EXISTS lms_passback_jobs_due_idx
    ON lms_passback_jobs(status, next_attempt_at) WHERE status IN ('pending','failed');



-- Client retries reuse the same key so a lost HTTP response cannot duplicate mastery.
CREATE TABLE IF NOT EXISTS session_turn_requests (
                                                     session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(session_id, idempotency_key)
    );


