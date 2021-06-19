import { Request, Response, Router } from 'express';
import { getJwks } from './oauth/keys';

export const wellKnownRouter = Router();

wellKnownRouter.get('/jwks.json', (req: Request, res: Response) => {
  res.status(200).json(getJwks());
});
