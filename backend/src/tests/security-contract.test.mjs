import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('mastery uniqueness is scoped to student, course and node', async () => {
    const sql = await read('migrations/001_mastery_course_scope.sql');
    assert.match(sql, /UNIQUE INDEX IF NOT EXISTS mastery_states_student_course_node_uq\s+ON mastery_states\(student_id,course_id,node_id\)/i);
});

test('application routes are mounted behind persistent authentication', async () => {
    const server = await read('src/server.ts');
    assert.match(server, /app\.use\('\/api', requireAuth\)/);
    assert.match(server, /app\.use\('\/api', emailAuthRouter\)/);
});

test('LTI state and launch codes are stored in PostgreSQL, not process memory', async () => {
    const oidc = await read('src/lti/oidc.ts');
    const launch = await read('src/lti/launch.ts');
    assert.match(oidc, /INSERT INTO lti_login_states/);
    assert.match(launch, /DELETE FROM lti_login_states/);
    assert.match(launch, /INSERT INTO lti_launch_codes/);
    assert.doesNotMatch(launch, /sessionCodeStore|oidcLoginStore/);
});

test('student identity is derived from the authenticated principal', async () => {
    const routes = await read('src/routes/sessions.ts');
    assert.match(routes, /student_id:\s*req\.auth!\.userId/);
    assert.doesNotMatch(routes, /req\.body\?\.student_id/);
});

test('turn persistence and passback outbox share a database transaction', async () => {
    const engine = await read('src/engine/socraticEngine.ts');
    assert.match(engine, /BEGIN/);
    assert.match(engine, /INSERT INTO turns/);
    assert.match(engine, /INSERT INTO lms_passback_jobs/);
    assert.match(engine, /ON CONFLICT \(student_id,course_id,node_id\)/);
});


test('turn retries are idempotent and request-body bound', async () => {
    const engine = await read('src/engine/socraticEngine.ts');
    const migration = await read('migrations/002_auth_and_reliability.sql');
    assert.match(engine, /session_turn_requests/);
    assert.match(engine, /request_hash/);
    assert.match(migration, /PRIMARY KEY\(session_id, idempotency_key\)/);
});

test('authorization uses course membership roles and CSRF on mutations', async () => {
    const auth = await read('src/auth/middleware.ts');
    const ws = await read('src/ws/hub.ts');
    assert.match(auth, /courseRoles\[courseId\]/);
    assert.match(auth, /x-agora-csrf/);
    assert.match(ws, /principal\.courseRoles\[course_id\]/);
    assert.doesNotMatch(ws, /searchParams\.get\('role'\)/);
});

test('LTI launch state is browser-bound and WebSockets validate Origin', async () => {
    const oidc = await read('src/lti/oidc.ts');
    const launch = await read('src/lti/launch.ts');
    const ws = await read('src/ws/hub.ts');
    assert.match(oidc, /agora_lti_state_/);
    assert.match(launch, /browserState !== state/);
    assert.match(ws, /allowedOrigins\.includes\(origin\)/);
});

test('CSRF token can be retrieved across separate frontend and API hosts', async () => {
    const session = await read('src/routes/session.ts');
    const authSession = await read('src/auth/session.ts');
    assert.match(session, /auth\/csrf/);
    assert.match(authSession, /httpOnly: true/);
    assert.match(authSession, /return csrfToken/);
});
