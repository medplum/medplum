import { badRequest, parseJWTPayload } from '@medplum/core';
import { DomainConfigurationIdentityProvider } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { getConfig } from '../config';
import { sendOutcome } from '../fhir/outcomes';
import { getUserByEmail, tryLogin } from '../oauth/utils';
import { getDomainConfiguration } from './method';

/*
 * External authentication callback
 * Based on: https://github.com/okta/okta-auth-js/blob/master/samples/generated/express-web-with-oidc/server.js
 */

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

  const body = JSON.parse(state);
  const domain = body.domain;
  const domainConfig = await getDomainConfiguration(domain);
  if (!domainConfig) {
    sendOutcome(res, badRequest('Domain not found'));
    return;
  }

  const idp = domainConfig.identityProvider;
  if (!idp) {
    sendOutcome(res, badRequest('Domain does not support external authentication'));
    return;
  }

  const userInfo = await verifyCode(idp, code);
  const email = userInfo.email as string;
  if (!email.endsWith('@' + domain)) {
    sendOutcome(res, badRequest('Email address does not match domain'));
    return;
  }

  const existingUser = await getUserByEmail(email, body.projectId);
  if (!existingUser) {
    sendOutcome(res, badRequest('User not found'));
    return;
  }

  const login = await tryLogin({
    authMethod: 'external',
    email,
    remember: true,
    clientId: body.clientId,
    scope: body.scope || 'openid',
    nonce: body.nonce || randomUUID(),
    launchId: body.launch,
    codeChallenge: body.codeChallenge,
    codeChallengeMethod: body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

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
 * Returns ID token claims for the authorization code.
 * @param idp The identity provider configuration.
 * @param code The authorization code.
 * @returns ID token claims.
 */
async function verifyCode(idp: DomainConfigurationIdentityProvider, code: string): Promise<Record<string, unknown>> {
  const auth = Buffer.from(idp.clientId + ':' + idp.clientSecret).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', getConfig().baseUrl + 'auth/external');
  params.append('code', code);

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
}
