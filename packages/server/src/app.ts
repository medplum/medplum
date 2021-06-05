import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import { authRouter } from './auth';
import { dicomRouter } from './dicom/routes';
import { fhirRouter } from './fhir';
import { oauthRouter } from './oauth';

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    // TODO: Check origin against whitelist
    callback(null, true);
  }
};

function errorHandler(req: Request, res: Response, next: NextFunction) {
  try {
    next();
  } catch (error: any) {
    console.log('Medplum unhandled error', error);
    res.sendStatus(500);
  }
}

export async function initApp(app: Express): Promise<Express> {
  // const envName = process.argv.length === 3 ? process.argv[2] : 'localhost';
  // console.log('envName', envName);

  // const config = await loadConfig(envName);
  // console.log('config', config);

  // // const secrets = await getSecrets('arn:aws:secretsmanager:us-east-1:647991932601:secret:MedplumStackBackEndDatabase-EGCWqzSdj8J9-MsYQit');
  // // console.log('secrets', secrets);

  // await initDatabase(config.database);

  app.set('trust proxy', true);
  app.set('x-powered-by', false);
  app.set('json spaces', 2);
  app.use(cors(corsOptions));
  app.use(express.json({
    type: ['application/json', 'application/fhir+json'],
    limit: '5mb'
  }));
  app.use(express.raw({
    type: '*/*',
    limit: '5mb'
  }));
  app.use(errorHandler);
  app.get('/', (req: Request, res: Response) => res.sendStatus(200));
  app.get('/healthcheck', (req: Request, res: Response) => res.send({ ok: true }));
  app.use('/auth/', authRouter);
  app.use('/dicom/PS3/', dicomRouter);
  app.use('/fhir/R4/', fhirRouter);
  app.use('/oauth2/', oauthRouter);
  app.use('/scim/v2/', fhirRouter);
  return app;
}
