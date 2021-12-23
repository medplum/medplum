import { createReference, getReferenceString, isOk } from '@medplum/core';
import { ClientApplication, Login } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { getRepoForLogin, systemRepo } from '../fhir';
import { logger } from '../logger';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const [tokenType, token] = req.headers.authorization?.split(' ') ?? [];
  if (!tokenType || !token) {
    res.sendStatus(401);
    return;
  }

  if (tokenType === 'Bearer') {
    await authenticateBearerToken(req, res, next, token);
  } else if (tokenType === 'Basic') {
    await authenticateBasicAuth(req, res, next, token);
  } else {
    res.sendStatus(401);
    return;
  }
}

async function authenticateBearerToken(req: Request, res: Response, next: NextFunction, token: string): Promise<void> {
  try {
    const verifyResult = await verifyJwt(token);
    const claims = verifyResult.payload as MedplumAccessTokenClaims;
    const [loginOutcome, login] = await systemRepo.readResource<Login>('Login', claims.login_id);
    if (!isOk(loginOutcome) || !login || login.revoked) {
      res.sendStatus(401);
      return;
    }

    res.locals.user = claims.username;
    res.locals.profile = claims.profile;
    res.locals.scope = claims.scope;
    res.locals.repo = await getRepoForLogin(login);
    next();
  } catch (err) {
    logger.error('verify error', err);
    res.sendStatus(401);
    return;
  }
}

async function authenticateBasicAuth(req: Request, res: Response, next: NextFunction, token: string): Promise<void> {
  const credentials = Buffer.from(token, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  if (!username || !password) {
    res.sendStatus(401);
    return;
  }

  const [outcome, client] = await systemRepo.readResource<ClientApplication>('ClientApplication', username);
  if (!isOk(outcome) || !client) {
    res.sendStatus(401);
    return;
  }

  if (client.secret !== password) {
    res.sendStatus(401);
    return;
  }

  const login: Login = {
    resourceType: 'Login',
    project: {
      reference: `Project/${client.meta?.project}`,
    },
    profile: createReference(client),
  };

  res.locals.user = client.id;
  res.locals.profile = getReferenceString(client);
  res.locals.scope = 'openid';
  res.locals.repo = await getRepoForLogin(login);
  next();
}
