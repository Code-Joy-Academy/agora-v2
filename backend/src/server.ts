import express from 'express';
import { randomUUID } from 'node:crypto';
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
import { emailAuthRouter } from './routes/emailAuth.js';
import { authRouter } from './routes/auth.js';

import { loadAllPacks } from './curriculum/curriculumLoader.js';
import { initWsHub } from './ws/hub.js';

import { config } from './config/env.js';
import cors, { type CorsOptions } from 'cors';


const app = express();

const allowedOrigins = new Set(
    config.corsOrigins
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean),
);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow requests without an Origin header (e.g. server-to-server).
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
      return callback(null, true);
    }

    console.warn('[CORS] Rejected origin:', origin);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Agora-CSRF',
    'Idempotency-Key',
  ],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// LOGGING
app.use((req, res, next) => {
  const requestId = randomUUID();
  const startedAt = Date.now();

  res.setHeader('X-Request-Id', requestId);

  console.info(JSON.stringify({
    event: 'http_request_started',
    requestId,
    method: req.method,
    path: req.path,
    origin: req.headers.origin ?? null,
    timestamp: new Date().toISOString(),
  }));

  res.on('finish', () => {
    console.info(JSON.stringify({
      event: 'http_request_completed',
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }));
  });

  next();
});

/* Security */
app.disable('x-powered-by');
app.use(helmet());

/* Body parsing */
app.use(express.json({limit: '1mb',}),);
app.use(express.urlencoded({limit: '1mb', extended: true,}),);

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
app.use('/api', authRouter);
app.use('/api', sessionRouter);
app.use('/api', authRouter);
app.use('/api', emailAuthRouter);
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
app.use((
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