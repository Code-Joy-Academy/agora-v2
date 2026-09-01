import { Router } from 'express';
import { generateKeyPair, exportJWK, SignJWT, importJWK, jwtVerify, type KeyLike } from 'jose';
import { randomUUID } from 'crypto';
import { MOCK_PLATFORM } from './platformConfig.js';
import { loadOrCreateToolKey } from './keys.js';

const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
const kid = randomUUID();
const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };

const issuedTokens = new Map<string, { expires: number }>();
const loggedScores: Array<{ lineitem: string; sub: string; score: number; at: string }> = [];

export const mockPlatformRouter = Router();

// Stand-in for "the LMS redirects the browser into the tool's login flow."
// A real platform does this after the user clicks the assignment link inside
// the LMS; here the frontend triggers it directly for local testing.
mockPlatformRouter.get('/simulate-launch', (req, res) => {
  const { role, name, course, class_code } = req.query as Record<string, string>;
  const login_hint = Buffer.from(JSON.stringify({ role, name, course, class_code })).toString('base64url');
  const base = `${req.protocol}://${req.get('host')}`;
  const params = new URLSearchParams({
    iss: MOCK_PLATFORM.issuer,
    login_hint,
    target_link_uri: `${base}/api/lti/launch`,
    client_id: MOCK_PLATFORM.client_id,
    lti_deployment_id: MOCK_PLATFORM.deployment_id,
  });
  res.redirect(`${base}/api/lti/login?${params.toString()}`);
});

mockPlatformRouter.get('/jwks', (_req, res) => res.json({ keys: [publicJwk] }));

// OIDC auth endpoint: mints a signed id_token with full LTI + AGS claims and
// form-posts it back to the tool's redirect_uri, exactly as a real platform would.
mockPlatformRouter.get('/authorize', async (req, res) => {
  const { redirect_uri, state, nonce, login_hint } = req.query as Record<string, string>;
  const hint = JSON.parse(Buffer.from(login_hint, 'base64url').toString('utf-8'));
  const base = `${req.protocol}://${req.get('host')}`;
  const sub = `mock-${hint.role}-${hint.name}`.toLowerCase().replace(/\s+/g, '-');

  const roleClaim = hint.role === 'Teacher'
    ? ['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor']
    : ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'];

  const token = await new SignJWT({
    nonce,
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': MOCK_PLATFORM.deployment_id,
    'https://purl.imsglobal.org/spec/lti/claim/roles': roleClaim,
    'https://purl.imsglobal.org/spec/lti/claim/context': { id: hint.class_code, title: hint.course, type: ['CourseOffering'] },
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: 'agora-node-map' },
    'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
      scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
      lineitem: `${base}/api/lti/mock-platform/lineitems/${encodeURIComponent(hint.class_code)}/scores`,
    },
    name: hint.name,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(MOCK_PLATFORM.issuer)
    .setAudience(MOCK_PLATFORM.client_id)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  res.send(`<!doctype html><html><body onload="document.forms[0].submit()">
    <form method="POST" action="${redirect_uri}">
      <input type="hidden" name="id_token" value="${token}">
      <input type="hidden" name="state" value="${state}">
    </form></body></html>`);
});

// AGS token endpoint: client_credentials grant, verified against Agora's own published JWKS
// (the tool authenticates itself to the platform the same way the platform authenticates to us).
mockPlatformRouter.post('/token', async (req, res) => {
  const assertion = req.body.client_assertion as string;
  try {
    const toolKey = await loadOrCreateToolKey();
    const key = (await importJWK(toolKey.publicJwk as any, 'RS256')) as KeyLike;
    await jwtVerify(assertion, key);
  } catch {
    return res.status(401).json({ error: 'invalid_client_assertion' });
  }
  const access_token = randomUUID();
  issuedTokens.set(access_token, { expires: Date.now() + 3600_000 });
  res.json({ access_token, token_type: 'Bearer', expires_in: 3600, scope: 'https://purl.imsglobal.org/spec/lti-ags/scope/score' });
});

// AGS score endpoint: stands in for the LMS gradebook — logs the passback in memory.
mockPlatformRouter.post('/lineitems/:lineitem/scores', (req, res) => {
  const auth = req.headers.authorization?.replace('Bearer ', '') ?? '';
  const record = issuedTokens.get(auth);
  if (!record || record.expires < Date.now()) return res.status(401).json({ error: 'invalid_token' });

  loggedScores.push({ lineitem: req.params.lineitem, sub: req.body.userId, score: req.body.scoreGiven, at: new Date().toISOString() });
  res.status(200).json({ resultUrl: `mock://gradebook/${req.params.lineitem}/${req.body.userId}` });
});

mockPlatformRouter.get('/gradebook/:lineitem', (req, res) => {
  res.json(loggedScores.filter((s) => s.lineitem === req.params.lineitem));
});
