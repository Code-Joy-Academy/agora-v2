import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { pool } from './db/pool.js';
import { loginRouter } from './lti/oidc.js';
import { launchRouter } from './lti/launch.js';
import { toolJwksRouter } from './lti/jwks.js';
import { mockPlatformRouter } from './lti/mockPlatform.js';
import { bootstrapMockPlatform } from './lti/bootstrapMockPlatform.js';
import { sessionRouter } from './routes/session.js';
import { nodesRouter } from './routes/nodes.js';
import { ingestionRouter } from './routes/ingestion.js';
import { sessionsRouter } from './routes/sessions.js';
import { dashboardRouter } from './routes/dashboard.js';
import { loadAllPacks } from './curriculum/curriculumLoader.js';
import { initWsHub } from './ws/hub.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true })); // LTI id_token form_post

app.use('/api', loginRouter);
app.use('/api', launchRouter);
app.use('/api', toolJwksRouter);
app.use('/api/lti/mock-platform', mockPlatformRouter);
app.use('/api', sessionRouter);
app.use('/api', nodesRouter);
app.use('/api', ingestionRouter);
app.use('/api', sessionsRouter);
app.use('/api', dashboardRouter);
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = createServer(app);
initWsHub(server);

const PORT = Number(process.env.PORT ?? 4000);
const BASE_URL = process.env.AGORA_BASE_URL ?? `http://localhost:${PORT}`;

await loadAllPacks();
await bootstrapMockPlatform(BASE_URL);

server.listen(PORT, () => console.log(`agora-v2 backend on :${PORT} (base ${BASE_URL})`));

process.on('SIGTERM', () => pool.end());
