// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  ContentType,
  parseLogLevel,
  unsupportedMediaType,
  warnIfNewerVersionAvailable,
} from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import compression from 'compression';
import cors from 'cors';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { json, Router, text, urlencoded } from 'express';
import { rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adminRouter } from './admin/routes.js';
import { asyncBatchHandler } from './async-batch.js';
import { authRouter } from './auth/routes.js';
import { cdsRouter } from './cds/routes.js';
import { getConfig } from './config/loader.js';
import type { MedplumServerConfig } from './config/types.js';
import {
  attachRequestContext,
  AuthenticatedRequestContext,
  closeRequestContext,
  tryGetRequestContext,
} from './context.js';
import { corsOptions } from './cors.js';
import { closeDatabase, initDatabase } from './database.js';
import { dicomRouter } from './dicom/routes.js';
import { emailRouter } from './email/routes.js';
import { binaryRouter } from './fhir/binary.js';
import { sendOutcome } from './fhir/outcomes.js';
import { fhirRouter } from './fhir/routes.js';
import { loadStructureDefinitions } from './fhir/structure.js';
import { fhircastSTU2Router, fhircastSTU3Router } from './fhircast/routes.js';
import { cleanupReservedDatabaseConnections, healthcheckHandler } from './healthcheck.js';
import { cleanupHeartbeat, initHeartbeat } from './heartbeat.js';
import { hl7BodyParser } from './hl7/parser.js';
import { keyValueRouter } from './keyvalue/routes.js';
import { getLogger, globalLogger } from './logger.js';
import { mcpRouter } from './mcp/routes.js';
import { maybeAutoRunPendingPostDeployMigration } from './migrations/migration-utils.js';
import { initKeys } from './oauth/keys.js';
import { authenticateRequest } from './oauth/middleware.js';
import { oauthRouter } from './oauth/routes.js';
import { openApiHandler } from './openapi.js';
import { cleanupOtelHeartbeat, initOtelHeartbeat } from './otel/otel.js';
import { closeRateLimiter, rateLimitHandler } from './ratelimit.js';
import { closeRedis, initRedis } from './redis.js';
import { scimRouter } from './scim/routes.js';
import { seedDatabase } from './seed.js';
import { initServerRegistryHeartbeatListener } from './server-registry.js';
import { initBinaryStorage } from './storage/loader.js';
import { storageRouter } from './storage/routes.js';
import { webhookRouter } from './webhook/routes.js';
import { closeWebSockets, initWebSockets } from './websockets.js';
import { wellKnownRouter } from './wellknown.js';
import { closeWorkers, initWorkers } from './workers.js';

let server: http.Server | undefined = undefined;

export const JSON_TYPE = [ContentType.JSON, 'application/*+json'];

/**
 * Sets standard headers for all requests.
 * @param _req - The request.
 * @param res - The response.
 * @param next - The next handler.
 */
function standardHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Disables all caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  if (getConfig().baseUrl.startsWith('https://')) {
    // Only connect to this site and subdomains via HTTPS for the next two years
    // and also include in the preload list
    res.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  // Set Content Security Policy
  // As an API server, block everything
  // See: https://stackoverflow.com/a/45631261/2051724
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';"
  );

  // Disable browser features
  res.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()'
  );

  // Never send the Referer header
  res.set('Referrer-Policy', 'no-referrer');

  // Prevent browsers from incorrectly detecting non-scripts as scripts
  res.set('X-Content-Type-Options', 'nosniff');

  // Disallow attempts to iframe site
  res.set('X-Frame-Options', 'DENY');

  // Block pages from loading when they detect reflected XSS attacks
  res.set('X-XSS-Protection', '1; mode=block');
  next();
}

/**
 * Global error handler.
 * See: https://expressjs.com/en/guide/error-handling.html
 * @param err - Unhandled error.
 * @param req - The request.
 * @param res - The response.
 * @param next - The next handler.
 */
function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  closeRequestContext();
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err.outcome) {
    sendOutcome(res, err.outcome as OperationOutcome);
    return;
  }
  if (err.resourceType === 'OperationOutcome') {
    sendOutcome(res, err as OperationOutcome);
    return;
  }
  if (err.type === 'request.aborted') {
    return;
  }
  if (err.type === 'entity.parse.failed') {
    sendOutcome(res, badRequest('Content could not be parsed'));
    return;
  }
  if (err.type === 'entity.too.large') {
    sendOutcome(res, badRequest('File too large'));
    return;
  }
  if (err.type === 'stream.not.readable') {
    // This is a common error when the client disconnects
    // See: https://expressjs.com/en/resources/middleware/body-parser.html
    // It is commonly associated with an AWS ALB disconnect status code 460
    // See: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html#http-460-issues
    getLogger().warn('Stream not readable', err);
    sendOutcome(res, badRequest('Stream not readable'));
    return;
  }
  if (err.name === 'UnsupportedMediaTypeError') {
    sendOutcome(res, unsupportedMediaType);
    return;
  }
  getLogger().error('Unhandled error', err);
  res.status(500).json({ msg: 'Internal Server Error' });
}

export async function initApp(app: Express, config: MedplumServerConfig): Promise<http.Server> {
  if (process.env.NODE_ENV !== 'test') {
    await warnIfNewerVersionAvailable('server', { base: config.baseUrl });
  }

  if (config.logLevel) {
    globalLogger.level = parseLogLevel(config.logLevel);
  }

  await initAppServices(config);
  server = http.createServer(app);
  initWebSockets(server);

  app.set('etag', false);
  app.set('trust proxy', 1);
  app.set('x-powered-by', false);
  app.use(standardHeaders);
  app.use(cors(corsOptions));
  app.use(compression());

  if (config.logRequests) {
    app.use(loggingMiddleware);
  }
  app.use(attachRequestContext);

  app.use(rateLimitHandler(config));
  app.use('/fhir/R4/Binary', binaryRouter);

  // Handle async batch by enqueueing job
  app.post('/fhir/R4', authenticateRequest, asyncBatchHandler(config));

  app.use(urlencoded({ extended: false }));
  app.use(text({ type: [ContentType.TEXT, ContentType.HL7_V2] }));
  app.use(json({ type: JSON_TYPE, limit: config.maxJsonSize }));
  app.use(
    hl7BodyParser({
      type: [ContentType.HL7_V2],
    })
  );
  app.use(defaultBodyParser());

  const apiRouter = Router();
  apiRouter.get('/', (_req, res) => res.sendStatus(200));
  apiRouter.get('/robots.txt', (_req, res) => res.type(ContentType.TEXT).send('User-agent: *\nDisallow: /'));
  apiRouter.get('/healthcheck', healthcheckHandler);
  apiRouter.get('/openapi.json', openApiHandler);
  apiRouter.use('/.well-known/', wellKnownRouter);
  apiRouter.use('/admin/', adminRouter);
  apiRouter.use('/auth/', authRouter);
  apiRouter.use('/cds-services/', cdsRouter);
  apiRouter.use('/dicom/PS3/', dicomRouter);
  apiRouter.use('/email/v1/', emailRouter);
  apiRouter.use('/fhir/R4/', fhirRouter);
  apiRouter.use('/fhircast/STU2/', fhircastSTU2Router);
  apiRouter.use('/fhircast/STU3/', fhircastSTU3Router);
  apiRouter.use('/keyvalue/v1/', keyValueRouter);
  apiRouter.use('/oauth2/', oauthRouter);
  apiRouter.use('/scim/v2/', scimRouter);
  apiRouter.use('/storage/', storageRouter);
  apiRouter.use('/webhook/', webhookRouter);

  if (config.mcpEnabled) {
    apiRouter.use('/mcp', mcpRouter);
  }

  app.use('/api/', apiRouter);
  app.use('/', apiRouter);
  app.use(errorHandler);
  return server;
}

export async function initAppServices(config: MedplumServerConfig): Promise<void> {
  loadStructureDefinitions();
  initRedis(config);
  await initDatabase(config);
  await seedDatabase(config);
  await initKeys(config);
  initBinaryStorage(config.binaryStorage);
  initWorkers(config);
  initHeartbeat(config);
  initOtelHeartbeat();
  initServerRegistryHeartbeatListener();
  await maybeAutoRunPendingPostDeployMigration();
}

export async function shutdownApp(): Promise<void> {
  cleanupOtelHeartbeat();
  cleanupHeartbeat();
  cleanupReservedDatabaseConnections();
  await closeWebSockets();
  if (server) {
    await new Promise((resolve) => {
      (server as http.Server).close(resolve);
    });
    server = undefined;
  }

  await closeWorkers();
  await closeDatabase();
  await closeRedis();
  closeRateLimiter();

  // If binary storage is a temporary directory, delete it
  const binaryStorage = getConfig().binaryStorage;
  if (binaryStorage?.startsWith('file:' + join(tmpdir(), 'medplum-temp-storage'))) {
    rmSync(binaryStorage.replace('file:', ''), { recursive: true, force: true });
  }
}

const loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = new Date();

  res.on('close', () => {
    const ctx = tryGetRequestContext();
    const duration = Date.now() - start.valueOf();
    getLogger().info('Request served', {
      durationMs: duration,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
      receivedAt: start,
      // If the response did not emit the 'finish' event, the client timed out and disconnected before it could be sent
      status: res.writableFinished ? res.statusCode : 408,
      ua: req.get('User-Agent'),
      mode: ctx instanceof AuthenticatedRequestContext ? ctx.repo.mode : undefined,
    });
  });

  next();
};

export async function runMiddleware(
  req: Request,
  res: Response,
  handler: (req: Request, res: Response, next: (err?: any) => void) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    handler(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Returns an Express middleware handler for ensuring req.body is not undefined. For backwards
 * compatibility with Express v4. See ${@link https://github.com/expressjs/body-parser/commit/6cbc279dc875ba1801e9ee5849f3f64e5b42f6e1}
 * @returns Express middleware request handler.
 */
function defaultBodyParser(): RequestHandler {
  return function defaultParser(req: Request, _res: Response, next: NextFunction) {
    req.body ??= {};
    next();
  };
}
