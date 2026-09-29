import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

import { config } from './config/env.js';

const app = express();

/*
 * Security
 */
app.disable('x-powered-by');
app.use(helmet());

/*
 * CORS
 */
app.use(
  cors({
    origin: config.corsOrigins,
  }),
);

/*
 * Body parsing
 */
app.use(
  express.json({
    limit: '1mb',
  }),
);

app.use(
  express.urlencoded({
    limit: '1mb',
    extended: true,
  }),
);

/*
 * LTI
 */
app.use('/api', loginRouter);
app.use('/api', launchRouter);
app.use('/api', toolJwksRouter);

/*
 * Mock LTI platform.
 *
 * Only enabled locally.
 */
if (config.enableMockPlatform) {
  app.use(
    '/api/lti/mock-platform',
    mockPlatformRouter,
  );
}

/*
 * Application routes
 */
app.use('/api', sessionRouter);
app.use('/api', nodesRouter);
app.use('/api', ingestionRouter);
app.use('/api', sessionsRouter);
app.use('/api', dashboardRouter);

/*
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
  });
});

/*
 * Readiness check
 */
app.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      ok: true,
    });
  } catch {
    res.status(503).json({
      ok: false,
    });
  }
});

/*
 * Error handler
 */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      'Unhandled server error:',
      err,
    );

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
    });
  },
);

/*
 * HTTP + WebSocket server
 */
const server = createServer(app);

initWsHub(server);

/*
 * Startup
 */
async function start() {
  console.log(
    `Starting Agora in ${config.nodeEnv} mode...`,
  );

  /*
   * Load curriculum before accepting requests.
   */
  await loadAllPacks();

  /*
   * Never run the mock platform in production.
   */
  if (
    config.nodeEnv !== 'production' &&
    config.enableMockPlatform
  ) {
    await bootstrapMockPlatform(
      config.agoraBaseUrl,
    );
  }

  server.listen(
    config.port,
    () => {
      console.log(
        `Agora backend listening on port ${config.port}`,
      );

      console.log(
        `Base URL: ${config.agoraBaseUrl}`,
      );
    },
  );
}

/*
 * Graceful shutdown
 */
async function shutdown(signal: string) {
  console.log(
    `${signal} received. Shutting down...`,
  );

  server.close(async () => {
    try {
      await pool.end();

      console.log(
        'Agora shutdown complete.',
      );

      process.exit(0);
    } catch (error) {
      console.error(
        'Shutdown error:',
        error,
      );

      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

/*
 * Start application
 */
start().catch((error) => {
  console.error(
    'Failed to start Agora:',
    error,
  );

  process.exit(1);
});