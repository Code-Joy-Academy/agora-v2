CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- IMPORTANT: Postgres superusers bypass Row-Level Security unconditionally —
-- FORCE ROW LEVEL SECURITY below only binds a non-superuser table owner.
-- The application MUST connect as a non-superuser role for the RLS policies
-- on document_chunks/documents to have any effect. Run once as a superuser:
--
--   CREATE ROLE agora_app LOGIN PASSWORD 'change-me';
--   GRANT CONNECT ON DATABASE agora_v2 TO agora_app;
--   GRANT USAGE ON SCHEMA public TO agora_app;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agora_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agora_app;
--
-- Then point DATABASE_URL at agora_app, not postgres. See README "RLS setup".

-- ============ Tenancy & LTI registration ============

-- One row per institution (a school/org that installs Agora as an LTI tool).
CREATE TABLE institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One row per LMS platform registration (Canvas instance, Moodle instance, etc).
-- `client_secret`-equivalent is not stored here: LTI 1.3 auth is asymmetric
-- (platform signs id_tokens with its own key, verified via `platform_jwks_url`;
-- Agora signs its own AGS-bound tokens with the keypair in lti_keys).
CREATE TABLE lti_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  platform_auth_login_url TEXT NOT NULL,
  platform_auth_token_url TEXT NOT NULL,
  platform_jwks_url TEXT NOT NULL,
  is_mock BOOLEAN NOT NULL DEFAULT false, -- true for the local/self-testable platform
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (issuer, client_id)
);

CREATE TABLE lti_deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id UUID NOT NULL REFERENCES lti_platforms(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform_id, deployment_id)
);

-- Agora's own signing keypair for AGS token requests (client_credentials + signed JWT assertion).
CREATE TABLE lti_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kid TEXT UNIQUE NOT NULL,
  public_jwk JSONB NOT NULL,
  private_pem TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ Courses & users ============

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES lti_deployments(id) ON DELETE SET NULL,
  lti_context_id TEXT, -- null until first real LTI launch links it
  title TEXT NOT NULL,
  curriculum_pack_id TEXT NOT NULL, -- FK-by-convention to a code-defined pack (see curriculum/packs)
  ags_lineitem_url TEXT, -- set once the platform hands us a lineitem to grade against
  scaffold_rules JSONB DEFAULT '{"friction_threshold_hints":3,"mastery_advance_threshold":0.6,"pedagogy_directness":0.3}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (deployment_id, lti_context_id)
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  lti_sub TEXT, -- LTI subject claim; null for users created outside an LTI launch
  role TEXT NOT NULL CHECK (role IN ('Teacher', 'Student')),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (institution_id, lti_sub)
);

CREATE TABLE course_memberships (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lti_user_lineitem_sub TEXT, -- the `sub` AGS passback is scored against for this user
  PRIMARY KEY (course_id, user_id)
);

-- ============ Curriculum ============

CREATE TABLE curriculum_nodes (
  id TEXT PRIMARY KEY, -- e.g. 'reading-explicit-implicit' — stable across packs, human-readable
  pack_id TEXT NOT NULL,
  strand TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sample_passage TEXT,
  order_index INT NOT NULL DEFAULT 0
);

CREATE TABLE node_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id TEXT NOT NULL REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  misconception_triggers JSONB NOT NULL DEFAULT '[]'
);

-- ============ Ingestion (multi-resource: notes, rubrics, assignment guidelines) ============

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'notes' CHECK (resource_type IN ('notes', 'rubric', 'assignment_guidelines')),
  source_format TEXT NOT NULL CHECK (source_format IN ('md', 'txt', 'pdf', 'docx')),
  raw_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE, -- denormalized for RLS + fast scoping
  node_id TEXT REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  heading TEXT,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  embedding vector(768), -- Gemini text-embedding-004 dimension; null when running the lexical-only stub
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX document_chunks_embedding_idx ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX document_chunks_course_idx ON document_chunks (course_id);

-- Row-Level Security: every chunk query must run inside a transaction that has
-- SET LOCAL app.current_course_id = '<uuid>' (see db/pool.ts withCourseScope).
-- This is the tenant-isolation backstop beneath the WHERE course_id = $1 the
-- application code already adds — belt and suspenders across course tenants.
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY; -- applies even to the table owner
CREATE POLICY document_chunks_course_isolation ON document_chunks
  USING (course_id::text = current_setting('app.current_course_id', true));

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_course_isolation ON documents
  USING (course_id::text = current_setting('app.current_course_id', true));

-- ============ Mastery, sessions, turns ============

CREATE TABLE mastery_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  p_mastery REAL NOT NULL DEFAULT 0.1,
  correct_count INT NOT NULL DEFAULT 0,
  incorrect_count INT NOT NULL DEFAULT 0,
  hint_count INT NOT NULL DEFAULT 0 CHECK (hint_count BETWEEN 0 AND 3),
  consecutive_successes INT NOT NULL DEFAULT 0,
  time_on_task_seconds INT NOT NULL DEFAULT 0,
  last_misconception TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, node_id)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES curriculum_nodes(id) ON DELETE SET NULL, -- null in exploratory mode
  mode TEXT NOT NULL DEFAULT 'socratic' CHECK (mode IN ('socratic', 'exploratory')),
  question_id UUID REFERENCES node_questions(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'tutor', 'teacher_override')),
  content TEXT NOT NULL,
  scaffold_level INT,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE friction_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  hint_count INT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX friction_alerts_course_idx ON friction_alerts (course_id, resolved);

-- ============ AGS grade passback log ============

CREATE TABLE ags_passback_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  score_given REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  response_snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
