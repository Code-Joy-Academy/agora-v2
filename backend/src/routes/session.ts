import { Router } from 'express';
import { sessionCodeStore } from '../lti/launch.js';

export const sessionRouter = Router();

sessionRouter.post('/session/exchange', (req, res) => {
  const { code } = req.body as { code: string };
  const entry = sessionCodeStore.get(code);
  if (!entry) return res.status(400).json({ error: 'invalid or expired launch code' });
  sessionCodeStore.delete(code); // single use
  res.json(entry.user);
});
