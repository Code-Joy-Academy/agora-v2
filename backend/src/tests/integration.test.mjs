// Needs a scratch Postgres with all migrations applied:
//   TEST_DATABASE_URL=postgres://.../agora_test npm test
// Rate-limit tests also need REDIS_URL. Both groups skip when the variable is unset.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL not set';
if (DB && !/test/i.test(new URL(DB).pathname)) throw new Error('TEST_DATABASE_URL must point at a database whose name contains "test"');
if (DB) process.env.DATABASE_URL = DB;

const sha = (v) => createHash('sha256').update(v).digest('hex');
let m, server, base;
const made = { institutions: [] };

before(async () => {
    if (!DB) return;
    m = {
        pool: (await import('../db/pool.ts')).pool,
        oidc: await import('../lti/oidc.ts'),
        launch: await import('../lti/launch.ts'),
        mock: await import('../lti/mockPlatform.ts'),
        boot: await import('../lti/bootstrapMockPlatform.ts'),
        admin: await import('../routes/institutionAdmin.ts'),
        loader: await import('../curriculum/curriculumLoader.ts'),
        worker: await import('../lti/passbackWorker.ts'),
    };
    const app = express();
    app.use(express.json({ type: ['application/json', 'application/*+json'] })); // AGS scores use +json
    app.use(express.urlencoded({ extended: true }));
    app.use('/api', m.oidc.loginRouter, m.launch.launchRouter);
    app.use('/api/lti/mock-platform', m.mock.mockPlatformRouter);
    app.use('/api/admin', m.admin.institutionAdminRouter);
    app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: String(err) }); });
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
    await m.pool.query(`DELETE FROM institutions WHERE name = 'Agora Dev Sandbox'`);
    await m.loader.loadAllPacks();
    await m.boot.bootstrapMockPlatform(base);
});

after(async () => {
    if (!DB) return;
    server.close();
    await m.pool.query('DELETE FROM institutions WHERE id = ANY($1::uuid[])', [made.institutions]);
    await m.pool.query(`DELETE FROM institutions WHERE name = 'Agora Dev Sandbox'`);
    await m.pool.end();
});

async function sandbox() {
    const { rows: [p] } = await m.pool.query(`SELECT id, institution_id FROM lti_platforms WHERE issuer = 'https://mock-lms.local'`);
    return p;
}

async function newUser(institution_id, role = 'Teacher', { admin = false } = {}) {
    const { rows: [u] } = await m.pool.query(`INSERT INTO users (institution_id, role, display_name, email) VALUES ($1,$2,'T',$3) RETURNING id`, [institution_id, role, `${randomUUID()}@t.test`]);
    if (admin) await m.pool.query('INSERT INTO institution_admins (user_id, institution_id) VALUES ($1,$2)', [u.id, institution_id]);
    const token = randomUUID(), csrf = randomUUID();
    await m.pool.query(`INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [u.id, sha(token)]);
    return { id: u.id, headers: { cookie: `agora_session=${token}; agora_csrf=${csrf}`, 'x-agora-csrf': csrf, 'content-type': 'application/json' } };
}

const api = (who, method, path, body) => fetch(`${base}/api/admin${path}`, { method, headers: who.headers, body: body && JSON.stringify(body) });

// Walk simulate-launch -> /lti/login -> mock authorize, returning the form-post fields.
async function prepareLaunch(cls, { role = 'Teacher', name = 'Ada', course = 'Maths' } = {}) {
    let r = await fetch(`${base}/api/lti/mock-platform/simulate-launch?${new URLSearchParams({ role, name, course, class_code: cls })}`, { redirect: 'manual' });
    r = await fetch(r.headers.get('location'), { redirect: 'manual' });
    const html = await (await fetch(r.headers.get('location'))).text();
    return { id_token: html.match(/name="id_token" value="([^"]+)"/)[1], state: html.match(/name="state" value="([^"]+)"/)[1] };
}
const postLaunch = (f) => fetch(`${base}/api/lti/launch`, { method: 'POST', redirect: 'manual', body: new URLSearchParams(f) });
const launch = async (cls, opts) => postLaunch(await prepareLaunch(cls, opts));

test('LTI curriculum mapping', { skip }, async (t) => {
    const sb = await sandbox();
    const admin = await newUser(sb.institution_id, 'Teacher', { admin: true });
    const plain = await newUser(sb.institution_id, 'Teacher');
    const cls = `cls-${randomUUID()}`;
    const mapBody = { platform_id: sb.id, deployment_id: 'agora-dev-deployment', lti_context_id: cls, curriculum_pack_id: 'cambridge-math-stage-9' };

    await t.test('unmapped context is rejected', async () => {
        assert.equal((await launch(cls)).status, 403);
    });
    await t.test('non-admins cannot manage mappings', async () => {
        assert.equal((await api(plain, 'GET', '/curriculum-mappings')).status, 403);
        assert.equal((await api(plain, 'POST', '/curriculum-mappings', mapBody)).status, 403);
    });
    await t.test('invalid curriculum is rejected', async () => {
        assert.equal((await api(admin, 'POST', '/curriculum-mappings', { ...mapBody, curriculum_pack_id: 'nope' })).status, 400);
    });
    let mappingId;
    await t.test('admin mapping is used by the launch; user is created once and membership is correct', async () => {
        const created = await api(admin, 'POST', '/curriculum-mappings', mapBody);
        assert.equal(created.status, 201);
        mappingId = (await created.json()).id;
        for (let i = 0; i < 2; i++) {
            const res = await launch(cls);
            assert.equal(res.status, 302);
            assert.match(res.headers.get('location'), /\?launch=/);
        }
        const { rows } = await m.pool.query(
            `SELECT c.curriculum_pack_id, cm.role, (SELECT count(*) FROM users WHERE lti_sub = cm.lti_user_lineitem_sub AND institution_id = $2) AS users
               FROM courses c JOIN course_memberships cm ON cm.course_id = c.id WHERE c.lti_context_id = $1`, [cls, sb.institution_id]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].curriculum_pack_id, 'cambridge-math-stage-9');
        assert.equal(rows[0].role, 'Teacher');
        assert.equal(Number(rows[0].users), 1);
    });
    await t.test('another institution cannot see or change this mapping', async () => {
        const { rows: [other] } = await m.pool.query(`INSERT INTO institutions (name) VALUES ($1) RETURNING id`, [`other-${randomUUID()}`]);
        made.institutions.push(other.id);
        const otherAdmin = await newUser(other.id, 'Teacher', { admin: true });
        assert.deepEqual((await (await api(otherAdmin, 'GET', '/curriculum-mappings')).json()).mappings, []);
        assert.equal((await api(otherAdmin, 'PATCH', `/curriculum-mappings/${mappingId}`, { curriculum_pack_id: 'cambridge-stage8-english' })).status, 404);
        assert.equal((await api(otherAdmin, 'DELETE', `/curriculum-mappings/${mappingId}`)).status, 404);
        assert.equal((await api(otherAdmin, 'POST', '/curriculum-mappings', mapBody)).status, 404);
    });
    await t.test('update applies on next launch; deactivation blocks launches', async () => {
        assert.equal((await api(admin, 'PATCH', `/curriculum-mappings/${mappingId}`, { curriculum_pack_id: 'cambridge-stage8-english' })).status, 200);
        assert.equal((await launch(cls)).status, 302);
        const { rows: [c] } = await m.pool.query('SELECT curriculum_pack_id FROM courses WHERE lti_context_id = $1', [cls]);
        assert.equal(c.curriculum_pack_id, 'cambridge-stage8-english');
        assert.equal((await api(admin, 'DELETE', `/curriculum-mappings/${mappingId}`)).status, 200);
        assert.equal((await launch(cls)).status, 403);
    });
});

test('OIDC state is persistent, single-use and expires', { skip }, async (t) => {
    const sb = await sandbox();
    const admin = await newUser(sb.institution_id, 'Teacher', { admin: true });
    const cls = `cls-${randomUUID()}`;
    await api(admin, 'POST', '/curriculum-mappings', { platform_id: sb.id, deployment_id: 'agora-dev-deployment', lti_context_id: cls, curriculum_pack_id: 'cambridge-stage8-english' });

    await t.test('state lives in the database and is consumed exactly once', async () => {
        const f = await prepareLaunch(cls);
        assert.equal((await m.pool.query('SELECT 1 FROM lti_login_states WHERE state = $1', [f.state])).rowCount, 1);
        assert.equal((await postLaunch(f)).status, 302);
        assert.equal((await m.pool.query('SELECT 1 FROM lti_login_states WHERE state = $1', [f.state])).rowCount, 0);
        assert.equal((await postLaunch(f)).status, 400);
    });
    await t.test('expired state is rejected', async () => {
        const f = await prepareLaunch(cls);
        await m.pool.query(`UPDATE lti_login_states SET expires_at = now() - interval '1 second' WHERE state = $1`, [f.state]);
        assert.equal((await postLaunch(f)).status, 400);
    });
});

test('course-level passback worker', { skip }, async (t) => {
    const sb = await sandbox();
    const { rows: [dep] } = await m.pool.query(`SELECT id FROM lti_deployments WHERE platform_id = $1`, [sb.id]);
    const student = await newUser(sb.institution_id, 'Student');
    const cls = `wk-${randomUUID()}`;
    const mkCourse = async (lineitem) => {
        const { rows: [c] } = await m.pool.query(
            `INSERT INTO courses (institution_id, deployment_id, lti_context_id, title, curriculum_pack_id, ags_lineitem_url) VALUES ($1,$2,$3,'C','cambridge-stage8-english',$4) RETURNING id`,
            [sb.institution_id, dep.id, randomUUID(), lineitem]);
        await m.pool.query(`INSERT INTO course_memberships (course_id, user_id, lti_user_lineitem_sub, role) VALUES ($1,$2,'sub-1','Student')`, [c.id, student.id]);
        return c.id;
    };
    const enqueue = (course_id) => m.pool.query(
        `INSERT INTO lms_passback_jobs(course_id,student_id) VALUES ($1,$2)
         ON CONFLICT (course_id,student_id) WHERE status IN ('pending','failed')
         DO UPDATE SET status='pending',attempts=0,next_attempt_at=now(),updated_at=now()`, [course_id, student.id]);
    const job = async (course_id) => (await m.pool.query('SELECT * FROM lms_passback_jobs WHERE course_id=$1 ORDER BY created_at DESC', [course_id])).rows;

    await t.test('repeated mastery changes keep a single open job', async () => {
        const course = await mkCourse(`${base}/api/lti/mock-platform/lineitems/${cls}/scores`);
        for (let i = 0; i < 3; i++) await enqueue(course);
        assert.equal((await job(course)).length, 1);
    });
    await t.test('sends the overall grade, counting unassessed nodes as zero', async () => {
        const course = await mkCourse(`${base}/api/lti/mock-platform/lineitems/${cls}/scores`);
        const { rows: nodes } = await m.pool.query(`SELECT id FROM curriculum_nodes WHERE pack_id = 'cambridge-stage8-english'`);
        await m.pool.query(`INSERT INTO mastery_states (student_id,node_id,course_id,p_mastery) VALUES ($1,$2,$3,0.8)`, [student.id, nodes[0].id, course]);
        await enqueue(course);
        await m.worker.processPassbackJobs();
        const [j] = await job(course);
        assert.equal(j.status, 'sent');
        const expected = Math.round((0.8 / nodes.length) * 100);
        const sent = await (await fetch(`${base}/api/lti/mock-platform/gradebook/${cls}`)).json();
        assert.equal(sent.at(-1).score, expected);
    });
    await t.test('failures retry with backoff; a new mastery change makes the job due again', async () => {
        const course = await mkCourse('http://127.0.0.1:1/scores');
        await enqueue(course);
        await m.worker.processPassbackJobs();
        const [j] = await job(course);
        assert.equal(j.status, 'failed');
        assert.equal(j.attempts, 1);
        assert.ok(new Date(j.next_attempt_at) > new Date());
        await enqueue(course);
        const [again] = await job(course);
        assert.equal(again.status, 'pending');
        assert.equal(again.attempts, 0);
    });
    await t.test('a job locked by another worker is not processed concurrently', async () => {
        const course = await mkCourse(`${base}/api/lti/mock-platform/lineitems/${cls}/scores`);
        await enqueue(course);
        const other = await m.pool.connect();
        try {
            await other.query('BEGIN');
            await other.query('SELECT id FROM lms_passback_jobs WHERE course_id = $1 FOR UPDATE', [course]);
            await m.worker.processPassbackJobs();
            assert.equal((await job(course))[0].status, 'pending');
        } finally {
            await other.query('ROLLBACK');
            other.release();
        }
    });
});

const rskip = (!process.env.REDIS_URL || !process.env.TEST_RATE_LIMIT) && 'set REDIS_URL and TEST_RATE_LIMIT=1 to run';
test('rate limiting is shared across instances and fails closed', { skip: rskip }, async (t) => {
    // Two limiter modules = two Redis clients, as if they were two backend instances.
    const route = `/auth/email/request-${randomUUID()}`; // unique key per run
    const mk = async (tag, connect = true) => {
        const mod = await import(`../auth/rateLimit.ts?${tag}`);
        if (connect) await mod.connectRateLimitStore();
        const app = express();
        app.post(route, mod.authRateLimit(2, 60_000), (_req, res) => res.json({ ok: true }));
        const srv = app.listen(0, '127.0.0.1');
        await new Promise((r) => srv.once('listening', r));
        return { mod, srv, url: `http://127.0.0.1:${srv.address().port}${route}` };
    };
    const a = await mk(`a${randomUUID()}`), b = await mk(`b${randomUUID()}`);
    t.after(async () => { a.srv.close(); b.srv.close(); await a.mod.closeRateLimitStore(); await b.mod.closeRateLimitStore(); });

    const post = (i) => fetch(i.url, { method: 'POST' });
    assert.equal((await post(a)).status, 200);
    assert.equal((await post(b)).status, 200);
    const blocked = await post(a);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await post(b)).status, 429);

    // Redis unreachable: sensitive endpoints must fail closed, not open.
    const { config } = await import('../config/env.ts');
    const saved = config.redisUrl;
    config.redisUrl = 'redis://127.0.0.1:1';
    const down = await mk(`down${randomUUID()}`, false);
    config.redisUrl = saved;
    t.after(() => down.srv.close());
    assert.equal((await post(down)).status, 503);
});
