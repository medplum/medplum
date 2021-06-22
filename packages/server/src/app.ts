import { json, raw, urlencoded } from 'body-parser';
import cors from 'cors';
import { Express, NextFunction, Request, Response } from 'express';
import { authRouter } from './auth';
import { dicomRouter } from './dicom/routes';
import { fhirRouter } from './fhir';
import { logger } from './logger';
import { oauthRouter } from './oauth';
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
function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err)
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
    type: ['application/json', 'application/fhir+json'],
    limit: '5mb'
  }));
  app.use(raw({
    type: '*/*',
    limit: '5mb'
  }));
  app.get('/', (req: Request, res: Response) => res.sendStatus(200));
  app.get('/healthcheck', (req: Request, res: Response) => res.json({ ok: true }));
  app.use('/.well-known/', wellKnownRouter);
  app.use('/auth/', authRouter);
  app.use('/dicom/PS3/', dicomRouter);
  app.use('/fhir/R4/', fhirRouter);
  app.use('/oauth2/', oauthRouter);
  app.use('/scim/v2/', fhirRouter);
  app.use(errorHandler);
  return app;
}
