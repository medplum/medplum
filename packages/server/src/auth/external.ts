// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  concatUrls,
  ContentType,
  encodeBase64,
  OAuthGrantType,
  OAuthTokenAuthMethod,
  OperationOutcomeError,
  parseJWTPayload,
} from '@medplum/core';
import type { ClientApplication, DomainConfiguration, IdentityProvider, Project } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { getClientRedirectUri } from '../oauth/clients';
import type { CodeChallengeMethod } from '../oauth/utils';
import { getClientApplication, tryLogin } from '../oauth/utils';
import { getDomainConfiguration } from './method';

/*
 * External authentication callback
 * Based on: https://github.com/okta/okta-auth-js/blob/master/samples/generated/express-web-with-oidc/server.js
 */

export interface ExternalAuthState {
  domain?: string;
  projectId?: string;
  clientId?: string;
  scope?: string;
  nonce?: string;
  launch?: string;
  codeChallenge?: string;
  codeChallengeMethod?: CodeChallengeMethod;
  redirectUri?: string;
  returnTo?: string;
}

export async function externalCallbackHandler(req: Request, res: Response): Promise<void> {
  const code = req.query.code as string;
  if (!code) {
    sendOutcome(res, badRequest('Missing code'));
    return;
  }

  const state = req.query.state as string;
  if (!state) {
    sendOutcome(res, badRequest('Missing state'));
    return;
  }

  let body: ExternalAuthState;
  try {
    body = JSON.parse(state);
  } catch {
    sendOutcome(res, badRequest('Invalid state'));
    return;
  }

  let domainConfig: DomainConfiguration | undefined;
  if (body.domain) {
    domainConfig = await getDomainConfiguration(body.domain);
  }

  const { idp, client } = await getIdentityProvider(body, domainConfig);
  if (!idp) {
    sendOutcome(res, badRequest('Identity provider not found'));
    return;
  }

  const userInfo = await verifyExternalCode(idp, code, body.codeChallenge);

  let email: string | undefined = undefined;
  let externalId: string | undefined = undefined;
  if (idp.useSubject) {
    externalId = userInfo.sub as string | undefined;
    if (!externalId) {
      sendOutcome(res, badRequest('External token does not contain subject'));
      return;
    }
  } else {
    email = (userInfo.email as string | undefined)?.toLowerCase();
    if (!email) {
      sendOutcome(res, badRequest('External token does not contain email address'));
      return;
    }
  }

  if (body.domain && !email?.endsWith('@' + body.domain)) {
    sendOutcome(res, badRequest('Email address does not match domain'));
    return;
  }

  let projectId = body.projectId;
  if (client) {
    if (projectId !== undefined && projectId !== client.meta?.project) {
      sendOutcome(res, badRequest('Invalid project'));
      return;
    }
    projectId = client.meta?.project;
  }

  const login = await tryLogin({
    authMethod: 'external',
    email,
    externalId,
    projectId,
    clientId: body.clientId,
    scope: body.scope ?? 'openid offline',
    nonce: body.nonce ?? randomUUID(),
    launchId: body.launch,
    codeChallenge: body.codeChallenge,
    codeChallengeMethod: body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  if (login.membership && body.redirectUri && client) {
    // Get the redirect URI from the client application
    let redirectUri = getClientRedirectUri(client, body.redirectUri);

    if (!redirectUri && (await isDangerousRedirectUriPartialMatchAllowed(client))) {
      // If projects have the allow-dangerous-redirect setting enabled, then we will allow partial matches for redirect URIs.
      // This is generally NOT recommended by the OAuth spec.
      // However, we need to support it here for backwards compatibility with existing clients.
      redirectUri = getClientRedirectUri(client, body.redirectUri, true);
      getLogger().warn('Redirect URI does not match any of the client application redirect URIs', {
        clientId: client.id,
        requestedUri: body.redirectUri,
        partialMatchUri: redirectUri,
      });
    }

    if (!redirectUri) {
      sendOutcome(res, badRequest('Invalid redirect URI'));
      return;
    }

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('login', login.id);
    redirectUrl.searchParams.set('code', login.code as string);
    res.redirect(redirectUrl.toString());
    return;
  }

  let signInPage: string;
  if (isValidReturnToUrl(body.returnTo, domainConfig)) {
    // This is the case for external auth with a returnTo URL specified in the state.
    signInPage = body.returnTo;
  } else {
    // This is the fallback case for external auth without a client application or redirect URI.
    signInPage = concatUrls(getConfig().appBaseUrl, login.launch ? 'oauth' : 'signin');
  }

  const redirectUrl = new URL(signInPage, getConfig().appBaseUrl);
  redirectUrl.searchParams.set('login', login.id);
  redirectUrl.searchParams.set('scope', login.scope as string);
  redirectUrl.searchParams.set('nonce', login.nonce as string);
  if (login.codeChallenge) {
    redirectUrl.searchParams.set('code_challenge', login.codeChallenge);
  }
  if (login.codeChallengeMethod) {
    redirectUrl.searchParams.set('code_challenge_method', login.codeChallengeMethod as string);
  }
  res.redirect(redirectUrl.toString());
}

/**
 * Tries to find the identity provider configuration.
 * @param state - The external auth state.
 * @param domainConfig - The domain configuration.
 * @returns External identity provider definition if found.
 */
async function getIdentityProvider(
  state: ExternalAuthState,
  domainConfig: DomainConfiguration | undefined
): Promise<{ idp?: IdentityProvider; client?: ClientApplication }> {
  let idp: IdentityProvider | undefined;
  let client: ClientApplication | undefined;

  if (state.clientId) {
    client = await getClientApplication(state.clientId);
    if (client.identityProvider) {
      return { idp: client.identityProvider, client };
    }
  }

  if (domainConfig?.identityProvider) {
    idp = domainConfig.identityProvider;
  }

  return { idp, client };
}

/**
 * Returns ID token claims for the authorization code.
 * @param idp - The identity provider configuration.
 * @param code - The authorization code.
 * @param codeVerifier - The code verifier.
 * @returns ID token claims.
 */
async function verifyExternalCode(
  idp: IdentityProvider,
  code: string,
  codeVerifier: string | undefined
): Promise<Record<string, unknown>> {
  const headers: HeadersInit = {
    Accept: ContentType.JSON,
    'Content-Type': ContentType.FORM_URL_ENCODED,
  };

  const params = new URLSearchParams();
  params.append('grant_type', OAuthGrantType.AuthorizationCode);
  params.append('redirect_uri', getConfig().baseUrl + 'auth/external');
  params.append('code', code);

  if (idp.usePkce && codeVerifier) {
    params.append('code_verifier', codeVerifier);
  }

  if (idp.tokenAuthMethod === OAuthTokenAuthMethod.ClientSecretPost) {
    params.append('client_id', idp.clientId);
    params.append('client_secret', idp.clientSecret);
  } else {
    // Default to client_secret_basic
    headers.Authorization = `Basic ${encodeBase64(idp.clientId + ':' + idp.clientSecret)}`;
  }

  try {
    const response = await fetch(idp.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      globalLogger.warn('Bad response from external auth check', { status: response.status, body: responseBody });
      throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
    }

    return parseJWTPayload(responseBody.id_token);
  } catch (err: any) {
    globalLogger.warn('Unhandled error in external auth check', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }
}

/**
 * Determines if the returnTo URL is valid based on the domain configuration.
 * @param returnTo - The returnTo URL from the external auth state.
 * @param domainConfig - The domain configuration for the external auth request.
 * @returns True if the returnTo URL is valid, false otherwise.
 */
function isValidReturnToUrl(
  returnTo: string | undefined,
  domainConfig: DomainConfiguration | undefined
): returnTo is string {
  if (!returnTo) {
    return false;
  }

  try {
    const returnToUrl = new URL(returnTo);
    return !!domainConfig?.allowedPostLoginRedirectUrls?.some((allowedUrl) => {
      try {
        const allowed = new URL(allowedUrl);
        return (
          returnToUrl.protocol === allowed.protocol &&
          returnToUrl.hostname === allowed.hostname &&
          returnToUrl.port === allowed.port &&
          returnToUrl.pathname.startsWith(allowed.pathname)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Returns true if the client application allows partial matching of redirect URIs, false otherwise.
 * @param client - The client application.
 * @returns True if partial matching is allowed, false otherwise.
 */
async function isDangerousRedirectUriPartialMatchAllowed(client: ClientApplication): Promise<boolean> {
  const systemRepo = getGlobalSystemRepo();
  const project = await systemRepo.readResource<Project>('Project', client.meta?.project as string);
  return project.setting?.find((s) => s.name === 'allow-dangerous-redirect')?.valueBoolean === true;
}
