import { badRequest } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import compression from 'compression';
import cors from 'cors';
import { Express, json, NextFunction, Request, Response, text, urlencoded } from 'express';
import { adminRouter } from './admin';
import { asyncWrap } from './async';
import { authRouter } from './auth';
import { getConfig } from './config';
import { corsOptions } from './cors';
import { dicomRouter } from './dicom/routes';
import { emailRouter } from './email/routes';
import { binaryRouter, fhirRouter, sendOutcome } from './fhir';
import { healthcheckHandler } from './healthcheck';
import { hl7BodyParser } from './hl7/parser';
import { logger } from './logger';
import { authenticateToken, oauthRouter } from './oauth';
import { openApiHandler } from './openapi';
import { scimRouter } from './scim';
import { storageRouter } from './storage';
import { wellKnownRouter } from './wellknown';

/**
 * Sets standard headers for all requests.
 * @param _req The request.
 * @param res The response.
 * @param next The next handler.
 */
function standardHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Disables all caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

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
  logger.error('Unhandled error', err);
  res.status(500).json({ msg: 'Internal Server Error' });
}

export async function initApp(app: Express): Promise<Express> {
  const config = getConfig();
  app.set('trust proxy', true);
  app.set('x-powered-by', false);
  app.use(standardHeaders);
  app.use(cors(corsOptions));
  app.use(compression());
  app.use('/fhir/R4/Binary', [authenticateToken], binaryRouter);
  app.use(
    urlencoded({
      extended: false,
    })
  );
  app.use(
    text({
      type: ['text/plain', 'x-application/hl7-v2+er7'],
    })
  );
  app.use(
    json({
      type: ['application/json', 'application/fhir+json', 'application/json-patch+json'],
      limit: config.maxJsonSize,
    })
  );
  app.use(
    hl7BodyParser({
      type: ['x-application/hl7-v2+er7'],
    })
  );
  app.get('/', (req: Request, res: Response) => res.sendStatus(200));
  app.get('/healthcheck', asyncWrap(healthcheckHandler));
  app.get('/openapi.json', openApiHandler);
  app.use('/.well-known/', wellKnownRouter);
  app.use('/admin/', adminRouter);
  app.use('/auth/', authRouter);
  app.use('/dicom/PS3/', dicomRouter);
  app.use('/email/v1/', emailRouter);
  app.use('/fhir/R4/', fhirRouter);
  app.use('/oauth2/', oauthRouter);
  app.use('/scim/v2/', scimRouter);
  app.use('/storage/', storageRouter);
  app.use(errorHandler);
  return app;
}
