import { assertOk, createReference, getReferenceString, isOk } from '@medplum/core';
import { ClientApplication, Login, ProjectMembership } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { getRepoForLogin, systemRepo } from '../fhir';
import { logger } from '../logger';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';
import { getUserMemberships, timingSafeEqualStr } from './utils';

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (await authenticateTokenImpl(req, res)) {
    next();
  } else {
    res.sendStatus(401);
  }
}

export async function authenticateTokenImpl(req: Request, res: Response): Promise<boolean> {
  const [tokenType, token] = req.headers.authorization?.split(' ') ?? [];
  if (!tokenType || !token) {
    return false;
  }

  if (tokenType === 'Bearer') {
    return authenticateBearerToken(res, token);
  } else if (tokenType === 'Basic') {
    return authenticateBasicAuth(res, token);
  } else {
    return false;
  }
}

async function authenticateBearerToken(res: Response, token: string): Promise<boolean> {
  try {
    const verifyResult = await verifyJwt(token);
    const claims = verifyResult.payload as MedplumAccessTokenClaims;
    const [loginOutcome, login] = await systemRepo.readResource<Login>('Login', claims.login_id);
    if (!isOk(loginOutcome) || !login || !login.membership || login.revoked) {
      return false;
    }

    const [membershipOutcome, membership] = await systemRepo.readReference<ProjectMembership>(login.membership);
    assertOk(membershipOutcome, membership);

    res.locals.login = login;
    res.locals.membership = membership;
    res.locals.user = claims.username;
    res.locals.profile = claims.profile;
    res.locals.scope = claims.scope;
    res.locals.repo = await getRepoForLogin(login, membership);
    return true;
  } catch (err) {
    logger.error('verify error', err);
    return false;
  }
}

async function authenticateBasicAuth(res: Response, token: string): Promise<boolean> {
  const credentials = Buffer.from(token, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  if (!username || !password) {
    return false;
  }

  const [outcome, client] = await systemRepo.readResource<ClientApplication>('ClientApplication', username);
  if (!isOk(outcome) || !client) {
    return false;
  }

  if (!timingSafeEqualStr(client.secret as string, password)) {
    return false;
  }

  const login: Login = {
    resourceType: 'Login',
  };

  const memberships = await getUserMemberships(createReference(client));
  if (memberships.length !== 1) {
    return false;
  }

  const membership = memberships[0];

  res.locals.login = login;
  res.locals.membership = membership;
  res.locals.user = client.id;
  res.locals.profile = getReferenceString(client);
  res.locals.scope = 'openid';
  res.locals.repo = await getRepoForLogin(login, membership);
  return true;
}
