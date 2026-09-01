import { generateKeyPair, exportJWK, exportPKCS8, importPKCS8 } from 'jose';
import { randomUUID } from 'crypto';
import { pool } from '../db/pool.js';
import type { KeyLike } from 'jose';

export interface ToolKey {
  kid: string;
  privateKey: KeyLike;
  publicJwk: Record<string, unknown>;
}

let cached: ToolKey | null = null;

export async function loadOrCreateToolKey(): Promise<ToolKey> {
  if (cached) return cached;

  const { rows } = await pool.query('SELECT kid, public_jwk, private_pem FROM lti_keys ORDER BY created_at DESC LIMIT 1');
  if (rows[0]) {
    const privateKey = (await importPKCS8(rows[0].private_pem, 'RS256')) as KeyLike;
    cached = { kid: rows[0].kid, privateKey, publicJwk: rows[0].public_jwk };
    return cached;
  }

  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = randomUUID();
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const privatePem = await exportPKCS8(privateKey);

  await pool.query('INSERT INTO lti_keys (kid, public_jwk, private_pem) VALUES ($1, $2, $3)', [kid, publicJwk, privatePem]);
  cached = { kid, privateKey, publicJwk };
  return cached;
}

// Run directly (`npm run lti:keys`) to provision the keypair ahead of first boot.
if (process.argv[1]?.endsWith('keys.ts') || process.argv[1]?.endsWith('keys.js')) {
  const key = await loadOrCreateToolKey();
  console.log(`tool key ready, kid=${key.kid}`);
  await pool.end();
}
