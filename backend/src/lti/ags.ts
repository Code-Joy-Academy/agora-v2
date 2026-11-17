import { SignJWT } from 'jose';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';
import { loadOrCreateToolKey } from './keys.js';
import { aggregateCourseMastery, toAgsScore } from './courseMastery.js';

async function signClientAssertion(audience: string, client_id: string): Promise<string> {
  const { kid, privateKey } = await loadOrCreateToolKey();
  return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(client_id)
      .setSubject(client_id)
      .setAudience(audience)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
}

async function requestAccessToken(tokenUrl: string, clientId: string): Promise<string> {
  const assertion = await signClientAssertion(tokenUrl, clientId);
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    }),
  });
  if (!res.ok) throw new Error(`AGS token request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

// Score endpoint is `{lineitem}/scores` (query string preserved); URLs already ending in /scores are used as-is.
const scoresUrl = (lineitem: string) => {
  const url = new URL(lineitem);
  if (!url.pathname.endsWith('/scores')) url.pathname = `${url.pathname.replace(/\/$/, '')}/scores`;
  return url.toString();
};

export async function getCourseMastery(course_id: string, student_id: string) {
  const { rows } = await pool.query<{ p_mastery: number | null }>(
      `SELECT m.p_mastery
       FROM courses c
       JOIN curriculum_nodes n ON n.pack_id = c.curriculum_pack_id
       LEFT JOIN mastery_states m ON m.node_id = n.id AND m.course_id = c.id AND m.student_id = $2
      WHERE c.id = $1`,
      [course_id, student_id],
  );
  return aggregateCourseMastery(rows.map((r) => r.p_mastery ?? 0));
}

// Passes the student's overall course mastery back to the LMS gradebook (0–100).
// No-ops quietly if the course has no ags_lineitem_url (not every launch grants AGS).
export async function passbackCourseMastery(course_id: string, student_id: string) {
  const { rows } = await pool.query(
      `SELECT c.ags_lineitem_url, lp.platform_auth_token_url, lp.client_id, cm.lti_user_lineitem_sub
       FROM courses c
              JOIN lti_deployments ld ON ld.id = c.deployment_id
              JOIN lti_platforms lp ON lp.id = ld.platform_id
              JOIN course_memberships cm ON cm.course_id = c.id AND cm.user_id = $2
       WHERE c.id = $1`,
      [course_id, student_id],
  );
  const row = rows[0];
  if (!row?.ags_lineitem_url) return { sent: false, reason: 'no_lineitem' as const };

  const { score, completed } = await getCourseMastery(course_id, student_id);
  const log = (status: 'sent' | 'failed', snippet: string) => pool.query(
      `INSERT INTO ags_passback_log (course_id, student_id, node_id, score_given, status, response_snippet) VALUES ($1,$2,NULL,$3,$4,$5)`,
      [course_id, student_id, score, status, snippet],
  );

  try {
    const token = await requestAccessToken(row.platform_auth_token_url, row.client_id);
    const res = await fetch(scoresUrl(row.ags_lineitem_url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.ims.lis.v1.score+json' },
      body: JSON.stringify({
        userId: row.lti_user_lineitem_sub,
        scoreGiven: toAgsScore(score),
        scoreMaximum: 100,
        activityProgress: completed ? 'Completed' : 'InProgress',
        gradingProgress: 'FullyGraded',
        timestamp: new Date().toISOString(),
      }),
    });
    await log(res.ok ? 'sent' : 'failed', (await res.text()).slice(0, 500));
    return { sent: res.ok, score };
  } catch (e) {
    await log('failed', (e as Error).message);
    return { sent: false, reason: 'error' as const, score };
  }
}
