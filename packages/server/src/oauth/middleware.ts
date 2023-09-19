import { OperationOutcomeError, unauthorized } from '@medplum/core';
import { ClientApplication, Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { systemRepo } from '../fhir/repo';
import { getClientApplicationMembership, getLoginForAccessToken, timingSafeEqualStr } from './utils';
import { getRequestContext, requestContextStore, AuthenticatedRequestContext } from '../context';
import { getRepoForLogin } from '../fhir/accesspolicy';

export interface AuthState {
  login: Login;
  project: Project;
  membership: ProjectMembership;
}

export function authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  return authenticateTokenImpl(req)
    .then(async ({ login, project, membership }) => {
      const ctx = getRequestContext();
      const repo = await getRepoForLogin(
        login,
        membership,
        project.strictMode,
        isExtendedMode(req),
        project.checkReferencesOnWrite
      );
      requestContextStore.run(new AuthenticatedRequestContext(ctx, login, project, membership, repo), () => next());
    })
    .catch(next);
}

export async function authenticateTokenImpl(req: Request): Promise<AuthState> {
  const [tokenType, token] = req.headers.authorization?.split(' ') ?? [];
  if (!tokenType || !token) {
    throw new OperationOutcomeError(unauthorized);
  }

  if (tokenType === 'Bearer') {
    return authenticateBearerToken(req, token);
  } else if (tokenType === 'Basic') {
    return authenticateBasicAuth(req, token);
  } else {
    throw new OperationOutcomeError(unauthorized);
  }
}

function authenticateBearerToken(req: Request, token: string): Promise<AuthState> {
  return getLoginForAccessToken(token).catch(() => {
    throw new OperationOutcomeError(unauthorized);
  });
}

async function authenticateBasicAuth(req: Request, token: string): Promise<AuthState> {
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

  return { login, project, membership };
}

function isExtendedMode(req: Request): boolean {
  return req.headers['x-medplum'] === 'extended';
}
