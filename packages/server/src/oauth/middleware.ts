import { createReference, resolveId, unauthorized } from '@medplum/core';
import { ClientApplication, Login, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { getRepoForLogin, systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';
import { getUserMemberships, timingSafeEqualStr } from './utils';

export function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  return authenticateTokenImpl(req, res).then(next).catch(next);
}

export async function authenticateTokenImpl(req: Request, res: Response): Promise<void> {
  const [tokenType, token] = req.headers.authorization?.split(' ') ?? [];
  if (!tokenType || !token) {
    throw unauthorized;
  }

  if (tokenType === 'Bearer') {
    await authenticateBearerToken(req, res, token);
  } else if (tokenType === 'Basic') {
    await authenticateBasicAuth(req, res, token);
  } else {
    throw unauthorized;
  }
}

async function authenticateBearerToken(req: Request, res: Response, token: string): Promise<void> {
  try {
    const verifyResult = await verifyJwt(token);
    const claims = verifyResult.payload as MedplumAccessTokenClaims;

    let login = undefined;
    try {
      login = await systemRepo.readResource<Login>('Login', claims.login_id);
    } catch (err) {
      throw unauthorized;
    }

    if (!login || !login.membership || login.revoked) {
      throw unauthorized;
    }

    const membership = await systemRepo.readReference<ProjectMembership>(login.membership);
    await setupLocals(req, res, login, membership);
  } catch (err) {
    logger.error('verify error', err);
    throw unauthorized;
  }
}

async function authenticateBasicAuth(req: Request, res: Response, token: string): Promise<void> {
  const credentials = Buffer.from(token, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  if (!username || !password) {
    throw unauthorized;
  }

  let client = undefined;

  try {
    client = await systemRepo.readResource<ClientApplication>('ClientApplication', username);
  } catch (err) {
    throw unauthorized;
  }

  if (!client) {
    throw unauthorized;
  }

  if (!timingSafeEqualStr(client.secret as string, password)) {
    throw unauthorized;
  }

  const login: Login = {
    resourceType: 'Login',
    authMethod: 'client',
  };

  const memberships = await getUserMemberships(createReference(client));
  if (memberships.length !== 1) {
    throw unauthorized;
  }

  await setupLocals(req, res, login, memberships[0]);
}

async function setupLocals(req: Request, res: Response, login: Login, membership: ProjectMembership): Promise<void> {
  const locals = res.locals;
  locals.login = login;
  locals.membership = membership;
  locals.user = resolveId(membership.user as Reference<User>);
  locals.profile = membership.profile;
  locals.project = await systemRepo.readReference(membership.project as Reference<Project>);
  locals.repo = await getRepoForLogin(
    login,
    membership,
    locals.project.strictMode,
    isExtendedMode(req),
    locals.project.checkReferencesOnWrite
  );
}

function isExtendedMode(req: Request): boolean {
  return req.headers['x-medplum'] === 'extended';
}
