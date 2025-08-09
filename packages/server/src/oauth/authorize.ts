// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDateProperty, Operator } from '@medplum/core';
import { ClientApplication, Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { URL } from 'url';
import { asyncWrap } from '../async';
import { getConfig } from '../config/loader';
import { getSystemRepo } from '../fhir/repo';
import { getLogger } from '../logger';
import { getClientRedirectUri } from './clients';
import { generateSecret, MedplumIdTokenClaims, verifyJwt } from './keys';
import { getClientApplication } from './utils';

/*
 * Handles the OAuth/OpenID Authorization Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
 */

/**
 * HTTP GET handler for /oauth2/authorize endpoint.
 */
export const authorizeGetHandler = asyncWrap(async (req: Request, res: Response) => {
  const validateResult = await validateAuthorizeRequest(req, res, req.query);
  if (!validateResult) {
    return;
  }

  sendSuccessRedirect(req, res, req.query);
});

/**
 * HTTP POST handler for /oauth2/authorize endpoint.
 */
export const authorizePostHandler = asyncWrap(async (req: Request, res: Response) => {
  const validateResult = await validateAuthorizeRequest(req, res, req.body);
  if (!validateResult) {
    return;
  }

  sendSuccessRedirect(req, res, req.body);
});

/**
 * Validates the OAuth/OpenID Authorization Endpoint configuration.
 * This is used for both GET and POST requests.
 * We currently only support query string parameters.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 * @param params - The params (query string params for GET, form body params for POST).
 * @returns True on success; false on error.
 */
async function validateAuthorizeRequest(req: Request, res: Response, params: Record<string, any>): Promise<boolean> {
  // First validate the client and the redirect URI.
  // If these are invalid, then show an error page.
  let client = undefined;
  try {
    client = await getClientApplication(params.client_id as string);
  } catch (_err) {
    res.status(400).send('Client not found');
    return false;
  }

  if (!params.redirect_uri) {
    res.status(400).send('Missing redirect URI');
    return false;
  }
  if (!URL.canParse(params.redirect_uri)) {
    res.status(400).send('Invalid redirect URI');
    return false;
  }
  const redirectUri = getClientRedirectUri(client, params.redirect_uri);
  if (!redirectUri) {
    res.status(400).send('Invalid redirect URI');
    return false;
  }

  const state = params.state ?? '';

  // Then, validate all other parameters.
  // If these are invalid, redirect back to the redirect URI.
  params.scope ??= client.defaultScope?.join(' ');
  if (!params.scope) {
    sendErrorRedirect(res, redirectUri, 'invalid_request', 'Missing scope', state);
    return false;
  }
  if (params.response_type !== 'code') {
    sendErrorRedirect(res, redirectUri, 'unsupported_response_type', 'Invalid response type', state);
    return false;
  }
  if (params.request) {
    sendErrorRedirect(res, redirectUri, 'request_not_supported', 'Unsupported request parameter', state);
    return false;
  }
  if (!isValidAudience(params.aud)) {
    sendErrorRedirect(res, redirectUri, 'invalid_request', 'Invalid audience', state);
    return false;
  }
  if (params.code_challenge && !params.code_challenge_method) {
    sendErrorRedirect(res, redirectUri, 'invalid_request', 'Missing code challenge method', state);
    return false;
  }
  if (params.launch && !(await isValidLaunch(params.launch))) {
    sendErrorRedirect(res, redirectUri, 'invalid_request', 'Invalid launch', state);
    return false;
  }

  const existingLogin = await getExistingLogin(req, client);

  const prompt = params.prompt as string | undefined;
  if (prompt === 'none' && !existingLogin) {
    sendErrorRedirect(res, redirectUri, 'login_required', 'Login required', state);
    return false;
  }

  if (prompt !== 'login' && existingLogin) {
    const systemRepo = getSystemRepo();
    const updatedLogin = await systemRepo.updateResource<Login>({
      ...existingLogin,
      nonce: params.nonce as string,
      codeChallenge: params.code_challenge ?? existingLogin.codeChallenge,
      codeChallengeMethod: params.code_challenge_method ?? existingLogin.codeChallengeMethod,
      code: generateSecret(16),
      launch: params.launch ? { reference: `SmartAppLaunch/${params.launch}` } : existingLogin.launch,
      granted: false,
    });

    if (prompt === 'none') {
      // Redirect straight to application without allowing scope changes
      const redirectUrl = new URL(params.redirect_uri as string);
      redirectUrl.searchParams.append('code', updatedLogin.code as string);
      redirectUrl.searchParams.append('state', state);
      res.redirect(redirectUrl.toString());
    } else {
      // Redirect to scope selection page to allow consent to updated scopes
      params.login = updatedLogin.id;
      if (!params.scope) {
        params.scope = updatedLogin.scope;
      }
      sendSuccessRedirect(req, res, params);
    }
    return false;
  }

  return true;
}

/**
 * Returns true if the audience is valid.
 * @param aud - The user provided audience.
 * @returns True if the audience is valid; false otherwise.
 */
function isValidAudience(aud: string | undefined): boolean {
  if (!aud) {
    // Allow missing aud parameter.
    // Technically, aud is required: https://www.hl7.org/fhir/smart-app-launch/app-launch.html#obtain-authorization-code
    // However, some FHIR validation tools do not include it, so we silently ignore missing values.
    return true;
  }

  try {
    const audUrl = new URL(aud);
    const serverUrl = new URL(getConfig().baseUrl);
    return audUrl.protocol === serverUrl.protocol && audUrl.host === serverUrl.host;
  } catch (_err) {
    return false;
  }
}

/**
 * Returns true if the launch parameter is valid.
 * @param launch - The launch parameter (which is a SmartAppLaunch ID).
 * @returns True if the launch is valid; false otherwise.
 */
async function isValidLaunch(launch: string): Promise<boolean> {
  const systemRepo = getSystemRepo();
  try {
    await systemRepo.readResource('SmartAppLaunch', launch);
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Tries to get an existing login for the current request.
 * @param req - The HTTP request.
 * @param client - The current client application.
 * @returns Existing login if found; undefined otherwise.
 */
async function getExistingLogin(req: Request, client: ClientApplication): Promise<Login | undefined> {
  const login = (await getExistingLoginFromIdTokenHint(req)) || (await getExistingLoginFromCookie(req, client));

  if (!login) {
    return undefined;
  }

  const authTime = getDateProperty(login.authTime) as Date;
  const age = (Date.now() - authTime.getTime()) / 1000;
  const maxAge = req.query.max_age ? parseInt(req.query.max_age as string, 10) : 3600;
  if (age > maxAge) {
    return undefined;
  }

  return login;
}

/**
 * Tries to get an existing login based on the "id_token_hint" query string parameter.
 * @param req - The HTTP request.
 * @returns Existing login if found; undefined otherwise.
 */
async function getExistingLoginFromIdTokenHint(req: Request): Promise<Login | undefined> {
  const idTokenHint = req.query.id_token_hint as string | undefined;
  if (!idTokenHint) {
    return undefined;
  }

  let verifyResult;
  try {
    verifyResult = await verifyJwt(idTokenHint);
  } catch (err: any) {
    getLogger().debug('Error verifying id_token_hint', err);
    return undefined;
  }

  const claims = verifyResult.payload as MedplumIdTokenClaims;
  const existingLoginId = claims.login_id as string | undefined;
  if (!existingLoginId) {
    return undefined;
  }

  const systemRepo = getSystemRepo();
  return systemRepo.readResource<Login>('Login', existingLoginId);
}

/**
 * Tries to get an existing login based on the HTTP cookies.
 * @param req - The HTTP request.
 * @param client - The current client application.
 * @returns Existing login if found; undefined otherwise.
 */
async function getExistingLoginFromCookie(req: Request, client: ClientApplication): Promise<Login | undefined> {
  const cookieName = 'medplum-' + client.id;
  const cookieValue = req.cookies[cookieName];
  if (!cookieValue) {
    return undefined;
  }

  const systemRepo = getSystemRepo();
  const bundle = await systemRepo.search<Login>({
    resourceType: 'Login',
    filters: [
      {
        code: 'cookie',
        operator: Operator.EQUALS,
        value: cookieValue,
      },
    ],
  });

  const login = bundle.entry?.[0]?.resource;
  return login?.granted && !login.revoked ? login : undefined;
}

/**
 * Sends a redirect back to the client application with error codes and state.
 * @param res - The response.
 * @param redirectUri - The client redirect URI.  This URI may already have query string parameters.
 * @param error - The OAuth/OpenID error code.
 * @param errorDescription - The error description.
 * @param state - The client state.
 */
function sendErrorRedirect(
  res: Response,
  redirectUri: string,
  error: string,
  errorDescription: string,
  state: string
): void {
  const url = new URL(redirectUri);
  url.searchParams.append('error', error);
  url.searchParams.append('error_description', errorDescription);
  url.searchParams.append('state', state);
  res.redirect(url.toString());
}

/**
 * Sends a successful redirect.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 * @param params - The redirect parameters.
 */
function sendSuccessRedirect(req: Request, res: Response, params: Record<string, any>): void {
  const redirectUrl = new URL(getConfig().appBaseUrl + 'oauth');
  for (const [name, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(name, value);
  }
  res.redirect(redirectUrl.toString());
}
