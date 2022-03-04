import { Request, Response, Router } from 'express';
import { logger } from '../logger';
import { authenticateToken } from '../oauth';

export const astmRouter = Router();
astmRouter.use(authenticateToken);

astmRouter.post('/v1', (req: Request, res: Response) => {
  logger.info('Received ASTM: ' + req.body);
  res.sendStatus(200);
});
