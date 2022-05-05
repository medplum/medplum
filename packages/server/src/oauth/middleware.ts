import { assertOk, createReference, getReferenceString, isOk } from '@medplum/core';
import { ClientApplication, Login, ProjectMembership } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { getRepoForLogin, systemRepo } from '../fhir';
import { logger } from '../logger';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';
import { getUserMemberships, timingSafeEqualStr } from './utils';

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [tokenType, token] = req.headers.authorization?.split(' ') ?? [];
  if (!tokenType || !token) {
    res.sendStatus(401);
    return;
  }

  if (tokenType === 'Bearer') {
    await authenticateBearerToken(res, next, token);
  } else if (tokenType === 'Basic') {
    await authenticateBasicAuth(res, next, token);
  } else {
    res.sendStatus(401);
    return;
  }
}

async function authenticateBearerToken(res: Response, next: NextFunction, token: string): Promise<void> {
  try {
    const verifyResult = await verifyJwt(token);
    const claims = verifyResult.payload as MedplumAccessTokenClaims;
    const [loginOutcome, login] = await systemRepo.readResource<Login>('Login', claims.login_id);
    if (!isOk(loginOutcome) || !login || !login.membership || login.revoked) {
      res.sendStatus(401);
      return;
    }

    const [membershipOutcome, membership] = await systemRepo.readReference<ProjectMembership>(login.membership);
    assertOk(membershipOutcome, membership);

    res.locals.login = login;
    res.locals.membership = membership;
    res.locals.user = claims.username;
    res.locals.profile = claims.profile;
    res.locals.scope = claims.scope;
    res.locals.repo = await getRepoForLogin(login, membership);

    next();
  } catch (err) {
    logger.error('verify error', err);
    res.sendStatus(401);
    return;
  }
}

async function authenticateBasicAuth(res: Response, next: NextFunction, token: string): Promise<void> {
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

  if (!timingSafeEqualStr(client.secret as string, password)) {
    res.sendStatus(401);
    return;
  }

  const login: Login = {
    resourceType: 'Login',
  };

  const memberships = await getUserMemberships(createReference(client));
  if (memberships.length !== 1) {
    res.sendStatus(401);
    return;
  }

  const membership = memberships[0];

  res.locals.login = login;
  res.locals.membership = membership;
  res.locals.user = client.id;
  res.locals.profile = getReferenceString(client);
  res.locals.scope = 'openid';
  res.locals.repo = await getRepoForLogin(login, membership);
  next();
}
