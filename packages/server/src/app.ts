import { badRequest, ContentType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import compression from 'compression';
import cors from 'cors';
import { Express, json, NextFunction, Request, Response, Router, text, urlencoded } from 'express';
import { rmSync } from 'fs';
import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { adminRouter } from './admin/routes';
import { asyncWrap } from './async';
import { authRouter } from './auth/routes';
import { getConfig, MedplumServerConfig } from './config';
import {
  attachRequestContext,
  AuthenticatedRequestContext,
  closeRequestContext,
  getLogger,
  getRequestContext,
  requestContextStore,
} from './context';
import { corsOptions } from './cors';
import { closeDatabase, initDatabase } from './database';
import { dicomRouter } from './dicom/routes';
import { emailRouter } from './email/routes';
import { binaryRouter } from './fhir/binary';
import { sendOutcome } from './fhir/outcomes';
import { fhirRouter } from './fhir/routes';
import { initBinaryStorage } from './fhir/storage';
import { loadStructureDefinitions } from './fhir/structure';
import { fhircastSTU2Router, fhircastSTU3Router } from './fhircast/routes';
import { healthcheckHandler } from './healthcheck';
import { cleanupHeartbeat, initHeartbeat } from './heartbeat';
import { hl7BodyParser } from './hl7/parser';
import { keyValueRouter } from './keyvalue/routes';
import { initKeys } from './oauth/keys';
import { oauthRouter } from './oauth/routes';
import { openApiHandler } from './openapi';
import { closeRateLimiter, getRateLimiter } from './ratelimit';
import { closeRedis, initRedis } from './redis';
import { scimRouter } from './scim/routes';
import { seedDatabase } from './seed';
import { storageRouter } from './storage';
import { closeWebSockets, initWebSockets } from './websockets';
import { wellKnownRouter } from './wellknown';
import { closeWorkers, initWorkers } from './workers';

let server: http.Server | undefined = undefined;

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
    'Permission-Policy',
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
  getLogger().error('Unhandled error', err);
  res.status(500).json({ msg: 'Internal Server Error' });
}

export async function initApp(app: Express, config: MedplumServerConfig): Promise<http.Server> {
  await initAppServices(config);
  server = http.createServer(app);
  initWebSockets(server);

  app.set('etag', false);
  app.set('trust proxy', 1);
  app.set('x-powered-by', false);
  app.use(standardHeaders);
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(attachRequestContext);
  app.use(getRateLimiter(config));
  app.use('/fhir/R4/Binary', binaryRouter);
  app.use(
    urlencoded({
      extended: false,
    })
  );
  app.use(
    text({
      type: [ContentType.TEXT, ContentType.HL7_V2],
    })
  );
  app.use(
    json({
      type: [ContentType.JSON, ContentType.FHIR_JSON, ContentType.JSON_PATCH, ContentType.SCIM_JSON],
      limit: config.maxJsonSize,
    })
  );
  app.use(
    hl7BodyParser({
      type: [ContentType.HL7_V2],
    })
  );

  if (config.logRequests) {
    app.use(loggingMiddleware);
  }

  const apiRouter = Router();
  apiRouter.get('/', (_req, res) => res.sendStatus(200));
  apiRouter.get('/robots.txt', (_req, res) => res.type(ContentType.TEXT).send('User-agent: *\nDisallow: /'));
  apiRouter.get('/healthcheck', asyncWrap(healthcheckHandler));
  apiRouter.get('/openapi.json', openApiHandler);
  apiRouter.use('/.well-known/', wellKnownRouter);
  apiRouter.use('/admin/', adminRouter);
  apiRouter.use('/auth/', authRouter);
  apiRouter.use('/dicom/PS3/', dicomRouter);
  apiRouter.use('/email/v1/', emailRouter);
  apiRouter.use('/fhir/R4/', fhirRouter);
  apiRouter.use('/fhircast/STU2/', fhircastSTU2Router);
  apiRouter.use('/fhircast/STU3/', fhircastSTU3Router);
  apiRouter.use('/keyvalue/v1/', keyValueRouter);
  apiRouter.use('/oauth2/', oauthRouter);
  apiRouter.use('/scim/v2/', scimRouter);
  apiRouter.use('/storage/', storageRouter);

  app.use('/api/', apiRouter);
  app.use('/', apiRouter);
  app.use(errorHandler);
  return server;
}

export function initAppServices(config: MedplumServerConfig): Promise<void> {
  return requestContextStore.run(AuthenticatedRequestContext.system(), async () => {
    loadStructureDefinitions();
    initRedis(config.redis);
    await initDatabase(config);
    await seedDatabase();
    await initKeys(config);
    initBinaryStorage(config.binaryStorage);
    initWorkers(config);
    initHeartbeat(config);
  });
}

export async function shutdownApp(): Promise<void> {
  cleanupHeartbeat();
  await closeWebSockets();
  await closeWorkers();
  await closeDatabase();
  await closeRedis();
  closeRateLimiter();

  if (server) {
    await new Promise((resolve) => {
      (server as http.Server).close(resolve);
    });
    server = undefined;
  }

  // If binary storage is a temporary directory, delete it
  const binaryStorage = getConfig().binaryStorage;
  if (binaryStorage?.startsWith('file:' + join(tmpdir(), 'medplum-temp-storage'))) {
    rmSync(binaryStorage.replace('file:', ''), { recursive: true, force: true });
  }
}

const loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const ctx = getRequestContext();
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    let userProfile: string | undefined;
    let projectId: string | undefined;
    if (ctx instanceof AuthenticatedRequestContext) {
      userProfile = ctx.profile.reference;
      projectId = ctx.project.id;
    }

    ctx.logger.info('Request served', {
      duration: `${duration} ms`,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
      profile: userProfile,
      projectId,
      receivedAt: start,
      status: res.statusCode,
      ua: req.get('User-Agent'),
      mode: ctx instanceof AuthenticatedRequestContext ? ctx.repo.mode : undefined,
    });
  });

  next();
};
