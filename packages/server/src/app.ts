import { badRequest } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import cors from 'cors';
import { Express, json, NextFunction, Request, Response, urlencoded } from 'express';
import { adminRouter } from './admin';
import { asyncWrap } from './async';
import { authRouter } from './auth';
import { getConfig } from './config';
import { dicomRouter } from './dicom/routes';
import { binaryRouter, fhirRouter, sendOutcome } from './fhir';
import { healthcheckHandler } from './healthcheck';
import { logger } from './logger';
import { authenticateToken, oauthRouter } from './oauth';
import { openApiHandler } from './openapi';
import { scimRouter } from './scim';
import { storageRouter } from './storage';
import { wellKnownRouter } from './wellknown';

/**
 * CORS configuration.
 * @param req The express request.
 * @param callback The cors plugin callback.
 */
const corsOptionsDelegate: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.header('Origin');
  let allow = false;
  if (origin) {
    const path = req.path;
    allow =
      path.startsWith('/.well-known/') ||
      path.startsWith('/auth/') ||
      path.startsWith('/fhir/') ||
      path.startsWith('/oauth2/');
  }
  callback(null, allow ? { origin, credentials: true } : undefined);
};

/**
 * Sets standard headers for all requests.
 * @param req The request.
 * @param res The response.
 * @param next The next handler.
 */
function standardHeaders(req: Request, res: Response, next: NextFunction): void {
  // Disables all caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Expires', 'Wed, 21 Oct 2015 07:28:00 GMT');
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
 * @param err Unhandled error.
 * @param req The request.
 * @param res The response.
 * @param next The next handler.
 */
function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    return next(err);
  }
  if (err.outcome) {
    sendOutcome(res, err.outcome as OperationOutcome);
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
  logger.error('Unhandled error', err);
  res.status(500).json({ msg: 'Internal Server Error' });
}

export async function initApp(app: Express): Promise<Express> {
  const config = getConfig();
  app.set('trust proxy', true);
  app.set('x-powered-by', false);
  app.use(standardHeaders);
  app.use(cors(corsOptionsDelegate));
  app.use('/fhir/R4/Binary', [authenticateToken], binaryRouter);
  app.use(
    urlencoded({
      extended: false,
    })
  );
  app.use(
    json({
      type: ['application/json', 'application/fhir+json', 'application/json-patch+json'],
      limit: config.maxJsonSize,
    })
  );
  app.get('/', (req: Request, res: Response) => res.sendStatus(200));
  app.get('/healthcheck', asyncWrap(healthcheckHandler));
  app.get('/openapi.json', openApiHandler);
  app.use('/.well-known/', wellKnownRouter);
  app.use('/admin/', adminRouter);
  app.use('/auth/', authRouter);
  app.use('/dicom/PS3/', dicomRouter);
  app.use('/fhir/R4/', fhirRouter);
  app.use('/oauth2/', oauthRouter);
  app.use('/scim/v2/', scimRouter);
  app.use('/storage/', storageRouter);
  app.use(errorHandler);
  return app;
}
