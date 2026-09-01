import { SignJWT } from 'jose';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';
import { loadOrCreateToolKey } from './keys.js';

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

// Passes a student's mastery on a node back to the LMS gradebook as a percentage score.
// No-ops quietly if the course has no ags_lineitem_url (not every launch grants AGS).
export async function passbackMastery(course_id: string, student_id: string, node_id: string, p_mastery: number) {
  const { rows } = await pool.query(
    `SELECT c.ags_lineitem_url, lp.platform_auth_token_url, lp.client_id, cm.lti_user_lineitem_sub
     FROM courses c
     JOIN lti_deployments ld ON ld.id = c.deployment_id
     JOIN lti_platforms lp ON lp.id = ld.platform_id
     JOIN course_memberships cm ON cm.course_id = c.id AND cm.user_id = $2
     WHERE c.id = $1`,
    [course_id, student_id]
  );
  const row = rows[0];
  if (!row?.ags_lineitem_url) return { sent: false, reason: 'no_lineitem' as const };

  try {
    const token = await requestAccessToken(row.platform_auth_token_url, row.client_id);
    const res = await fetch(row.ags_lineitem_url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.ims.lis.v1.score+json' },
      body: JSON.stringify({
        userId: row.lti_user_lineitem_sub,
        scoreGiven: Math.round(p_mastery * 100),
        scoreMaximum: 100,
        activityProgress: p_mastery >= 0.8 ? 'Completed' : 'InProgress',
        gradingProgress: 'FullyGraded',
        timestamp: new Date().toISOString(),
      }),
    });
    const snippet = (await res.text()).slice(0, 500);
    await pool.query(
      `INSERT INTO ags_passback_log (course_id, student_id, node_id, score_given, status, response_snippet) VALUES ($1,$2,$3,$4,$5,$6)`,
      [course_id, student_id, node_id, p_mastery, res.ok ? 'sent' : 'failed', snippet]
    );
    return { sent: res.ok };
  } catch (e) {
    await pool.query(
      `INSERT INTO ags_passback_log (course_id, student_id, node_id, score_given, status, response_snippet) VALUES ($1,$2,$3,$4,'failed',$5)`,
      [course_id, student_id, node_id, p_mastery, (e as Error).message]
    );
    return { sent: false, reason: 'error' as const };
  }
}
