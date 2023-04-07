import { OperationOutcomeError, unauthorized } from '@medplum/core';
import { ClientApplication, Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { systemRepo } from '../fhir/repo';
import { MedplumAccessTokenClaims, verifyJwt } from './keys';
import { getClientApplicationMembership, timingSafeEqualStr } from './utils';

export function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  return authenticateTokenImpl(req, res).then(next).catch(next);
}

export async function authenticateTokenImpl(req: Request, res: Response): Promise<void> {
  const [tokenType, token] = req.headers.authorization?.split(' ') ?? [];
  if (!tokenType || !token) {
    throw new OperationOutcomeError(unauthorized);
  }

  if (tokenType === 'Bearer') {
    await authenticateBearerToken(req, res, token);
  } else if (tokenType === 'Basic') {
    await authenticateBasicAuth(req, res, token);
  } else {
    throw new OperationOutcomeError(unauthorized);
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
      throw new OperationOutcomeError(unauthorized);
    }

    if (!login || !login.membership || login.revoked) {
      throw new OperationOutcomeError(unauthorized);
    }

    const membership = await systemRepo.readReference<ProjectMembership>(login.membership);
    const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
    await setupLocals(req, res, login, project, membership);
  } catch (err) {
    throw new OperationOutcomeError(unauthorized);
  }
}

async function authenticateBasicAuth(req: Request, res: Response, token: string): Promise<void> {
  const credentials = Buffer.from(token, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  if (!username || !password) {
    throw new OperationOutcomeError(unauthorized);
  }

  let client = undefined;

  try {
    client = await systemRepo.readResource<ClientApplication>('ClientApplication', username);
  } catch (err) {
    throw new OperationOutcomeError(unauthorized);
  }

  if (!client) {
    throw new OperationOutcomeError(unauthorized);
  }

  if (!timingSafeEqualStr(client.secret as string, password)) {
    throw new OperationOutcomeError(unauthorized);
  }

  const membership = await getClientApplicationMembership(client);
  if (!membership) {
    throw new OperationOutcomeError(unauthorized);
  }

  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
  const login: Login = {
    resourceType: 'Login',
    authMethod: 'client',
    superAdmin: project.superAdmin,
  };

  await setupLocals(req, res, login, project, membership);
}

async function setupLocals(
  req: Request,
  res: Response,
  login: Login,
  project: Project,
  membership: ProjectMembership
): Promise<void> {
  const locals = res.locals;
  locals.login = login;
  locals.project = project;
  locals.membership = membership;
  locals.profile = membership.profile;
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
