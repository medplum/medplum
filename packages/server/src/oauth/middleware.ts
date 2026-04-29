// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { OperationOutcomeError, unauthorized } from '@medplum/core';
import type { Bot, ClientApplication, Login, Project, ProjectMembership, UserConfiguration } from '@medplum/fhirtypes';
import type { NextFunction, Request, Response } from 'express';
import type { IncomingMessage } from 'node:http';
import { getConfig } from '../config/loader';
import { AuthenticatedRequestContext, getRequestContext } from '../context';
import type { Repository } from '../fhir/repo';
import { getLoginForAccessToken, getLoginForBasicAuth } from './utils';

export type AuthState = {
  login: Login;
  project: WithId<Project>;
  membership: WithId<ProjectMembership>;
  profile?: WithId<ProfileResource | Bot | ClientApplication>;
  userConfig: UserConfiguration;
  accessToken?: string;

  onBehalfOf?: WithId<ProfileResource>;
  onBehalfOfMembership?: WithId<ProjectMembership>;
};

export type AuthenticationResult = {
  authState: AuthState;
  repo: Repository;
};

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

export async function authenticateTokenImpl(req: Request): Promise<AuthenticationResult | undefined> {
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

export function isExtendedMode(req: Request | IncomingMessage): boolean {
  return req.headers['x-medplum'] === 'extended';
}
