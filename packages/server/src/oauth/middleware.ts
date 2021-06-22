import { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.sendStatus(401);
  }

  try {
    const verifyResult = await verifyJwt(token);
    const claims = verifyResult.payload as MedplumAccessTokenClaims;
    res.locals.user = claims.username;
    res.locals.profile = claims.profile;
  } catch (err) {
    logger.error('verify error', err);
    return res.sendStatus(401);
  }

  next();
}
