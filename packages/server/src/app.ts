import { badRequest, OperationOutcome } from '@medplum/core';
import { json, raw, urlencoded } from 'body-parser';
import cors from 'cors';
import { Express, NextFunction, Request, Response } from 'express';
import { adminRouter } from './admin';
import { asyncWrap } from './async';
import { authRouter } from './auth';
import { dicomRouter } from './dicom/routes';
import { fhirRouter, sendOutcome } from './fhir';
import { healthcheckHandler } from './healthcheck';
import { logger } from './logger';
import { oauthRouter } from './oauth';
import { openApiHandler } from './openapi';
import { scimRouter } from './scim';
import { storageRouter } from './storage';
import { wellKnownRouter } from './wellknown';

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    // TODO: Check origin against whitelist
    callback(null, true);
  }
};

/**
 * Disables all caching.
 * @param req The request.
 * @param res The response.
 * @param next The next handler.
 */
function cacheHandler(req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Expires', 'Wed, 21 Oct 2015 07:28:00 GMT');
  res.set('Pragma', 'no-cache');
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
    return next(err)
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
  app.set('trust proxy', true);
  app.set('x-powered-by', false);
  app.set('json spaces', 2);
  app.use(cacheHandler);
  app.use(cors(corsOptions));
  app.use(urlencoded({
    extended: false
  }));
  app.use(json({
    type: ['application/json', 'application/fhir+json', 'application/json-patch+json'],
    limit: '10mb'
  }));
  app.use(raw({
    type: '*/*',
    limit: '100mb'
  }));
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
