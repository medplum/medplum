import { Request, Response, Router } from 'express';
import { getJwks } from './oauth/keys';

export const wellKnownRouter = Router();

wellKnownRouter.get('/', (req: Request, res: Response) => res.sendStatus(200));

wellKnownRouter.get('/jwks.json', (req: Request, res: Response) => {
  const jwks = getJwks();
  console.log('well known handler', { keys: jwks });
  res.status(200).json({ keys: jwks });
});
