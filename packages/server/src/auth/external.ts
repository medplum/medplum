import { badRequest, OperationOutcomeError, parseJWTPayload } from '@medplum/core';
import { ClientApplication, IdentityProvider } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { getConfig } from '../config';
import { sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { tryLogin } from '../oauth/utils';
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
  codeChallengeMethod?: string;
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

  const body = JSON.parse(state) as ExternalAuthState;

  const { idp, client } = await getIdentityProvider(body);
  if (!idp) {
    sendOutcome(res, badRequest('Identity provider not found'));
    return;
  }

  const userInfo = await verifyCode(idp, code);

  let email: string | undefined = undefined;
  let externalId: string | undefined = undefined;
  if (idp.useSubject) {
    externalId = userInfo.sub as string;
  } else {
    email = userInfo.email as string;
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
    remember: true,
    projectId: projectId,
    clientId: body.clientId,
    scope: body.scope || 'openid',
    nonce: body.nonce || randomUUID(),
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
    redirectUrl.searchParams.set('code', login.code as string);
    res.redirect(redirectUrl.toString());
    return;
  }

  const signInPage = login.launch ? 'oauth' : 'signin';
  const redirectUrl = new URL(getConfig().appBaseUrl + signInPage);
  redirectUrl.searchParams.set('login', login.id as string);
  redirectUrl.searchParams.set('scope', login.scope as string);
  redirectUrl.searchParams.set('nonce', login.nonce as string);
  redirectUrl.searchParams.set('code_challenge', login.codeChallenge as string);
  redirectUrl.searchParams.set('code_challenge_method', login.codeChallengeMethod as string);
  res.redirect(redirectUrl.toString());
};

/**
 * Tries to find the identity provider configuration.
 * @param state The external auth state.
 * @returns External identity provider definition if found.
 */
async function getIdentityProvider(
  state: ExternalAuthState
): Promise<{ idp?: IdentityProvider; client?: ClientApplication }> {
  if (state.domain) {
    const domainConfig = await getDomainConfiguration(state.domain);
    if (domainConfig?.identityProvider) {
      return { idp: domainConfig.identityProvider };
    }
  }

  if (state.clientId) {
    const client = await systemRepo.readResource<ClientApplication>('ClientApplication', state.clientId);
    if (client?.identityProvider) {
      return { idp: client.identityProvider, client };
    }
  }

  return {};
}

/**
 * Returns ID token claims for the authorization code.
 * @param idp The identity provider configuration.
 * @param code The authorization code.
 * @returns ID token claims.
 */
async function verifyCode(idp: IdentityProvider, code: string): Promise<Record<string, unknown>> {
  const auth = Buffer.from(idp.clientId + ':' + idp.clientSecret).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', getConfig().baseUrl + 'auth/external');
  params.append('code', code);

  try {
    const response = await fetch(idp.tokenUrl as string, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const tokens = await response.json();
    return parseJWTPayload(tokens.id_token);
  } catch (err) {
    logger.warn('Failed to verify code', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }
}
