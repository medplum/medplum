import { OperationOutcomeError, createReference, unauthorized } from '@medplum/core';
import { ClientApplication, Login, Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { IncomingMessage } from 'http';
import { AuthenticatedRequestContext, getRequestContext } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { getClientApplicationMembership, getLoginForAccessToken, timingSafeEqualStr } from './utils';

export interface AuthState {
  login: Login;
  project: Project;
  membership: ProjectMembership;
  accessToken?: string;
}

export function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
  const ctx = getRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    next();
  } else {
    next(new OperationOutcomeError(unauthorized));
  }
}

export async function authenticateTokenImpl(req: IncomingMessage): Promise<AuthState | undefined> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return undefined;
  }

  const [tokenType, token] = authHeader.split(' ');
  if (!tokenType || !token) {
    return undefined;
  }

  if (tokenType === 'Bearer') {
    return getLoginForAccessToken(token);
  }

  if (tokenType === 'Basic') {
    return authenticateBasicAuth(req, token);
  }

  return undefined;
}

async function authenticateBasicAuth(req: IncomingMessage, token: string): Promise<AuthState | undefined> {
  const credentials = Buffer.from(token, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  if (!username || !password) {
    return undefined;
  }

  const systemRepo = getSystemRepo();
  let client: ClientApplication;
  try {
    client = await systemRepo.readResource<ClientApplication>('ClientApplication', username);
  } catch (err) {
    return undefined;
  }

  if (!timingSafeEqualStr(client.secret as string, password)) {
    return undefined;
  }

  const membership = await getClientApplicationMembership(client);
  if (!membership) {
    return undefined;
  }

  const project = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
  const login: Login = {
    resourceType: 'Login',
    user: createReference(client),
    authMethod: 'client',
    authTime: new Date().toISOString(),
  };

  return { login, project, membership };
}

export function isExtendedMode(req: Request): boolean {
  return req.headers['x-medplum'] === 'extended';
}
