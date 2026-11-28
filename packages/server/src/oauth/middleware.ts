// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { concatUrls, forbidden, isUUID, OperationOutcomeError, unauthorized } from '@medplum/core';
import type {
  Bot,
  ClientApplication,
  Login,
  Project,
  ProjectMembership,
  SmartAppLaunch,
  UserConfiguration,
} from '@medplum/fhirtypes';
import type { NextFunction, Request, Response } from 'express';
import type { IncomingMessage } from 'node:http';
import { getConfig } from '../config/loader';
import { AuthenticatedRequestContext, getRequestContext } from '../context';
import type { Repository } from '../fhir/repo';
import { getProjectIdFromUrl } from '../util/url';
import { getLoginForAccessToken, getLoginForBasicAuth } from './utils';

export type AuthState = {
  login: Login;
  project: WithId<Project>;
  membership: WithId<ProjectMembership>;
  profile?: WithId<ProfileResource | Bot | ClientApplication>;
  userConfig: UserConfiguration;
  accessToken?: string;
  smartAppLaunch?: WithId<SmartAppLaunch>;

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
    const projectId = getProjectIdFromUrl(req.originalUrl);
    if (projectId && projectId !== ctx.project.id) {
      next(new OperationOutcomeError(forbidden));
      return;
    }
    next();
  } else {
    const requestAuthScheme = req.headers.authorization?.split(' ')[0] ?? 'Bearer';
    const responseAuthScheme = res.req.query[PROMPT_BASIC_AUTH_PARAM] ? 'Basic' : requestAuthScheme;
    const { baseUrl } = getConfig();
    let challenge = `${responseAuthScheme} realm="${baseUrl}"`;
    if (responseAuthScheme.toLowerCase() === 'bearer') {
      // RFC 9728 section 5.1: point clients, such as MCP clients, at the protected resource metadata
      const projectId = getProjectIdFromUrl(req.originalUrl);
      const metadataBaseUrl = projectId && isUUID(projectId) ? concatUrls(baseUrl, `projects/${projectId}/`) : baseUrl;
      challenge += `, resource_metadata="${concatUrls(metadataBaseUrl, '.well-known/oauth-protected-resource')}"`;
    }
    res.set('WWW-Authenticate', challenge);
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
