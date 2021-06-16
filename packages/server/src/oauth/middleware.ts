import { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';
import { verifyJwt } from './keys';

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]

  if (token) {
    try {
      const verifyResult = await verifyJwt(token);
      res.locals.user = verifyResult.username;
      res.locals.profile = verifyResult.profile;
    } catch (err) {
      logger.error('verify error', err);
      return res.sendStatus(403);
    }
  }

  next();
}
