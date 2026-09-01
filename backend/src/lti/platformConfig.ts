// ===== Local mock platform (default, no live LMS required) =====
// Registered into `lti_platforms` on boot with is_mock=true. Its auth/token/jwks
// endpoints are served by this same backend (see lti/mockPlatform.ts), so the
// full OIDC + launch + AGS passback loop is exercisable with zero external setup.
export const MOCK_PLATFORM = {
  issuer: 'https://mock-lms.local',
  client_id: 'agora-dev-client',
  deployment_id: 'agora-dev-deployment',
  platform_auth_login_url: (base: string) => `${base}/api/lti/mock-platform/authorize`,
  platform_auth_token_url: (base: string) => `${base}/api/lti/mock-platform/token`,
  platform_jwks_url: (base: string) => `${base}/api/lti/mock-platform/jwks`,
};

// ===== Real LMS registration (commented out — fill in and register a row in
// `lti_platforms` with is_mock=false once you have a Canvas or Moodle
// developer key / external tool registration) =====
//
// Canvas (Admin > Developer Keys > + LTI Key):
// export const CANVAS_PLATFORM = {
//   issuer: 'https://canvas.instructure.com',
//   client_id: process.env.CANVAS_CLIENT_ID!,              // from the Developer Key
//   platform_auth_login_url: 'https://<your-canvas-domain>/api/lti/authorize_redirect',
//   platform_auth_token_url: 'https://<your-canvas-domain>/login/oauth2/token',
//   platform_jwks_url: 'https://<your-canvas-domain>/api/lti/security/jwks',
// };
// Redirect URIs to register in Canvas: {AGORA_BASE_URL}/api/lti/launch
// OIDC login URL to register in Canvas: {AGORA_BASE_URL}/api/lti/login
// JWKS URL to give Canvas: {AGORA_BASE_URL}/api/lti/jwks
//
// Moodle (Site administration > Plugins > External tool > Manage tools > configure via LTI Advantage):
// export const MOODLE_PLATFORM = {
//   issuer: 'https://<your-moodle-domain>',
//   client_id: process.env.MOODLE_CLIENT_ID!,
//   platform_auth_login_url: 'https://<your-moodle-domain>/mod/lti/auth.php',
//   platform_auth_token_url: 'https://<your-moodle-domain>/mod/lti/token.php',
//   platform_jwks_url: 'https://<your-moodle-domain>/mod/lti/certs.php',
// };
// Tool URL: {AGORA_BASE_URL}/api/lti/launch
// Initiate login URL: {AGORA_BASE_URL}/api/lti/login
// Public key type: JWKS URL -> {AGORA_BASE_URL}/api/lti/jwks
//
// To go live: insert a `lti_platforms` row for the chosen platform (is_mock=false),
// then a matching `lti_deployments` row once the platform hands you its deployment_id
// on first registration handshake.
