import { Router } from 'express';
import { loadOrCreateToolKey } from './keys.js';

export const toolJwksRouter = Router();

toolJwksRouter.get('/lti/jwks', async (_req, res) => {
  const { publicJwk } = await loadOrCreateToolKey();
  res.json({ keys: [publicJwk] });
});
