// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, ProfileResource, unauthorized, WithId } from '@medplum/core';
import { Login, Project, ProjectMembership, UserConfiguration } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { getConfig } from '../config/loader';
import { AuthenticatedRequestContext, getRequestContext } from '../context';
import { getLoginForAccessToken, getLoginForBasicAuth } from './utils';

export interface AuthState {
  login: Login;
  project: WithId<Project>;
  membership: WithId<ProjectMembership>;
  userConfig: UserConfiguration;
  accessToken?: string;

  onBehalfOf?: WithId<ProfileResource>;
  onBehalfOfMembership?: WithId<ProjectMembership>;
}

export const PROMPT_BASIC_AUTH_PARAM = '_medplum-prompt-basic-auth';

export function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
  const ctx = getRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    next();
  } else {
    if (res.req.query[PROMPT_BASIC_AUTH_PARAM]) {
      res.set('WWW-Authenticate', `Basic realm="${getConfig().baseUrl}"`);
    }
    next(new OperationOutcomeError(unauthorized));
  }
}

export async function authenticateTokenImpl(req: Request): Promise<AuthState | undefined> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return undefined;
  }

  const [tokenType, token] = authHeader.split(' ');
  if (!tokenType || !token) {
    return undefined;
  }

  if (tokenType === 'Bearer') {
    return getLoginForAccessToken(req, token);
  }

  if (tokenType === 'Basic') {
    return getLoginForBasicAuth(req, token);
  }

  return undefined;
}

export function isExtendedMode(req: Request): boolean {
  return req.headers['x-medplum'] === 'extended';
}
