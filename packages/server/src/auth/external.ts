import {
  badRequest,
  ContentType,
  encodeBase64,
  OAuthGrantType,
  OAuthTokenAuthMethod,
  OperationOutcomeError,
  parseJWTPayload,
} from '@medplum/core';
import { ClientApplication, IdentityProvider } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { getConfig } from '../config';
import { sendOutcome } from '../fhir/outcomes';
import { globalLogger } from '../logger';
import { CodeChallengeMethod, getClientApplication, tryLogin } from '../oauth/utils';
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
}

export const externalCallbackHandler = async (req: Request, res: Response): Promise<void> => {
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
  } catch (_err) {
    sendOutcome(res, badRequest('Invalid state'));
    return;
  }

  const { idp, client } = await getIdentityProvider(body);
  if (!idp) {
    sendOutcome(res, badRequest('Identity provider not found'));
    return;
  }

  const userInfo = await verifyExternalCode(idp, code, body.codeChallenge);

  let email: string | undefined = undefined;
  let externalId: string | undefined = undefined;
  if (idp.useSubject) {
    externalId = userInfo.sub as string;
  } else {
    email = (userInfo.email as string).toLowerCase();
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
    projectId: projectId,
    clientId: body.clientId,
    scope: body.scope ?? 'openid offline',
    nonce: body.nonce ?? randomUUID(),
    launchId: body.launch,
    codeChallenge: body.codeChallenge,
    codeChallengeMethod: body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  if (login.membership && body.redirectUri && client?.redirectUri) {
    if (!body.redirectUri.startsWith(client.redirectUri)) {
      sendOutcome(res, badRequest('Invalid redirect URI'));
      return;
    }
    const redirectUrl = new URL(body.redirectUri);
    redirectUrl.searchParams.set('login', login.id as string);
    redirectUrl.searchParams.set('code', login.code as string);
    res.redirect(redirectUrl.toString());
    return;
  }

  const signInPage = login.launch ? 'oauth' : 'signin';
  const redirectUrl = new URL(signInPage, getConfig().appBaseUrl);
  redirectUrl.searchParams.set('login', login.id as string);
  redirectUrl.searchParams.set('scope', login.scope as string);
  redirectUrl.searchParams.set('nonce', login.nonce as string);
  if (login.codeChallenge) {
    redirectUrl.searchParams.set('code_challenge', login.codeChallenge as string);
  }
  if (login.codeChallengeMethod) {
    redirectUrl.searchParams.set('code_challenge_method', login.codeChallengeMethod as string);
  }
  res.redirect(redirectUrl.toString());
};

/**
 * Tries to find the identity provider configuration.
 * @param state - The external auth state.
 * @returns External identity provider definition if found.
 */
async function getIdentityProvider(
  state: ExternalAuthState
): Promise<{ idp?: IdentityProvider; client?: ClientApplication }> {
  let idp: IdentityProvider | undefined;
  let client: ClientApplication | undefined;

  if (state.clientId) {
    client = await getClientApplication(state.clientId);
    if (client.identityProvider) {
      return { idp: client.identityProvider, client };
    }
  }

  if (state.domain) {
    const domainConfig = await getDomainConfiguration(state.domain);
    if (domainConfig?.identityProvider) {
      idp = domainConfig.identityProvider;
    }
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
    params.append('client_id', idp.clientId as string);
    params.append('client_secret', idp.clientSecret as string);
  } else {
    // Default to client_secret_basic
    headers.Authorization = `Basic ${encodeBase64(idp.clientId + ':' + idp.clientSecret)}`;
  }

  try {
    const response = await fetch(idp.tokenUrl as string, {
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
