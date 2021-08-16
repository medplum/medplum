import { Login } from '@medplum/core';
import { NextFunction, Request, Response } from 'express';
import { getRepoForLogin, isOk, repo } from '../fhir';
import { logger } from '../logger';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';

export interface MedplumRequestContext {
  user: string;
  profile: string;
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.sendStatus(401);
  }

  try {
    const verifyResult = await verifyJwt(token);
    const claims = verifyResult.payload as MedplumAccessTokenClaims;
    const [loginOutcome, login] = await repo.readResource<Login>('Login', claims.login_id);
    if (!isOk(loginOutcome) || !login || login.revoked) {
      return res.sendStatus(401);
    }

    res.locals.user = claims.username;
    res.locals.profile = claims.profile;
    res.locals.scope = claims.scope;
    res.locals.repo = getRepoForLogin(login);
  } catch (err) {
    logger.error('verify error', err);
    return res.sendStatus(401);
  }

  next();
}
