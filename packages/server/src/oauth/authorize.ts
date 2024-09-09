import { getDateProperty, Operator } from '@medplum/core';
import { ClientApplication, Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { URL } from 'url';
import { asyncWrap } from '../async';
import { getConfig } from '../config';
import { getLogger } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { MedplumIdTokenClaims, verifyJwt } from './keys';
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

  if (client.redirectUri !== params.redirect_uri) {
    res.status(400).send('Incorrect redirect_uri');
    return false;
  }

  const state = params.state as string;

  // Then, validate all other parameters.
  // If these are invalid, redirect back to the redirect URI.
  const scope = params.scope as string | undefined;
  if (!scope) {
    sendErrorRedirect(res, client.redirectUri as string, 'invalid_request', state);
    return false;
  }

  const responseType = params.response_type;
  if (responseType !== 'code') {
    sendErrorRedirect(res, client.redirectUri as string, 'unsupported_response_type', state);
    return false;
  }

  const requestObject = params.request as string | undefined;
  if (requestObject) {
    sendErrorRedirect(res, client.redirectUri as string, 'request_not_supported', state);
    return false;
  }

  const aud = params.aud as string | undefined;
  if (!isValidAudience(aud)) {
    sendErrorRedirect(res, client.redirectUri as string, 'invalid_request', state);
    return false;
  }

  const codeChallenge = params.code_challenge;
  if (codeChallenge) {
    const codeChallengeMethod = params.code_challenge_method;
    if (!codeChallengeMethod) {
      sendErrorRedirect(res, client.redirectUri as string, 'invalid_request', state);
      return false;
    }
  }

  const existingLogin = await getExistingLogin(req, client);

  const prompt = params.prompt as string | undefined;
  if (prompt === 'none' && !existingLogin) {
    sendErrorRedirect(res, client.redirectUri as string, 'login_required', state);
    return false;
  }

  if (prompt !== 'login' && existingLogin) {
    const systemRepo = getSystemRepo();
    await systemRepo.updateResource<Login>({
      ...existingLogin,
      nonce: params.nonce as string,
      granted: false,
    });

    const redirectUrl = new URL(params.redirect_uri as string);
    redirectUrl.searchParams.append('code', existingLogin.code as string);
    redirectUrl.searchParams.append('state', state);
    res.redirect(redirectUrl.toString());
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
 * @param state - The client state.
 */
function sendErrorRedirect(res: Response, redirectUri: string, error: string, state: string): void {
  const url = new URL(redirectUri);
  url.searchParams.append('error', error);
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
