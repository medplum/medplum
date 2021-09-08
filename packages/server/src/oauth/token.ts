import { ClientApplication, createReference, getReferenceString, isOk, Login, Operator } from '@medplum/core';
import { createHash } from 'crypto';
import { Request, RequestHandler, Response } from 'express';
import { asyncWrap } from '../async';
import { repo } from '../fhir';
import { generateAccessToken, MedplumRefreshTokenClaims, verifyJwt } from './keys';
import { getAuthTokens, getReferenceIdPart, revokeLogin } from './utils';

/**
 * Handles the OAuth/OpenID Token Endpoint.
 *
 * Implements the following authorization flows:
 *  1) Client Credentials - for server-to-server access
 *  2) Authorization Code - for user access
 *  3) Refresh - for "remember me" long term access
 *
 * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
 */
export const tokenHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  if (!req.is('application/x-www-form-urlencoded')) {
    return res.status(400).send('Unsupported content type');
  }

  const grantType = req.body.grant_type;
  if (!grantType) {
    return sendTokenError(res, 'invalid_request', 'Missing grant_type');
  }

  switch (grantType) {
    case 'client_credentials':
      return handleClientCredentials(req, res);
    case 'authorization_code':
      return handleAuthorizationCode(req, res);
    case 'refresh_token':
      return handleRefreshToken(req, res);
    default:
      return sendTokenError(res, 'invalid_request', 'Unsupported grant_type');
  }
});

/**
 * Handles the "Client Credentials" OAuth flow.
 * See: https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns Async promise to the response.
 */
async function handleClientCredentials(req: Request, res: Response): Promise<Response> {
  const clientId = req.body.client_id;
  if (!clientId) {
    return sendTokenError(res, 'invalid_request', 'Missing client_id');
  }

  const clientSecret = req.body.client_secret;
  if (!clientSecret) {
    return sendTokenError(res, 'invalid_request', 'Missing client_secret');
  }

  const [readOutcome, client] = await repo.readResource<ClientApplication>('ClientApplication', clientId);
  if (!isOk(readOutcome) || !client) {
    return sendTokenError(res, 'invalid_request', 'Invalid client');
  }

  if (!client.secret) {
    return sendTokenError(res, 'invalid_request', 'Invalid client');
  }

  if (client.secret !== clientSecret) {
    return sendTokenError(res, 'invalid_request', 'Invalid secret');
  }

  const scope = req.body.scope as string;

  const [loginOutcome, login] = await repo.createResource<Login>({
    resourceType: 'Login',
    client: createReference(client),
    profile: createReference(client),
    authTime: new Date(),
    defaultProject: {
      reference: 'Project/' + client.meta?.project
    },
    scope
  });

  if (!isOk(loginOutcome) || !login) {
    return sendTokenError(res, 'invalid_request', 'Invalid login');
  }

  const accessToken = await generateAccessToken({
    login_id: login.id as string,
    client_id: client.id as string,
    sub: client.id as string,
    username: client.id as string,
    profile: getReferenceString(client),
    scope: scope
  });

  return res.status(200).json({
    token_type: 'Bearer',
    access_token: accessToken,
    expires_in: 3600,
    scope
  });
}

/**
 * Handles the "Authorization Code Grant" flow.
 * See: https://datatracker.ietf.org/doc/html/rfc6749#section-4.1
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns Async promise to the response.
 */
async function handleAuthorizationCode(req: Request, res: Response): Promise<Response> {
  const code = req.body.code;
  if (!code) {
    return sendTokenError(res, 'invalid_request', 'Missing code');
  }

  const [searchOutcome, searchResult] = await repo.search({
    resourceType: 'Login',
    filters: [{
      code: 'code',
      operator: Operator.EQUALS,
      value: code
    }]
  });

  if (!isOk(searchOutcome) ||
    !searchResult ||
    !searchResult.entry ||
    searchResult.entry.length === 0) {
    return sendTokenError(res, 'invalid_request', 'Invalid code');
  }

  const login = searchResult.entry[0].resource as Login;

  if (login.granted) {
    await revokeLogin(login);
    return sendTokenError(res, 'invalid_grant', 'Token already granted');
  }

  if (login.revoked) {
    return sendTokenError(res, 'invalid_grant', 'Token revoked');
  }

  if (login.codeChallenge) {
    const codeVerifier = req.body.code_verifier;
    if (!codeVerifier) {
      return sendTokenError(res, 'invalid_grant', 'Missing code verifier');
    }

    if (!verifyCode(login.codeChallenge, login.codeChallengeMethod as string, codeVerifier)) {
      return sendTokenError(res, 'invalid_grant', 'Invalid code verifier');
    }
  }

  const [tokenOutcome, token] = await getAuthTokens(login);
  if (!isOk(tokenOutcome) || !token) {
    return sendTokenError(res, 'invalid_request', 'Invalid token');
  }

  return res.status(200).json({
    token_type: 'Bearer',
    scope: login.scope,
    expires_in: 3600,
    id_token: token.idToken,
    access_token: token.accessToken,
    refresh_token: token.refreshToken
  });
}

/**
 * Handles the "Refresh" flow.
 * See: https://datatracker.ietf.org/doc/html/rfc6749#section-6
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns Async promise to the response.
 */
async function handleRefreshToken(req: Request, res: Response): Promise<Response> {
  const refreshToken = req.body.refresh_token;
  if (!refreshToken) {
    return sendTokenError(res, 'invalid_request', 'Invalid refresh token');
  }

  let claims: MedplumRefreshTokenClaims;
  try {
    claims = (await verifyJwt(refreshToken)).payload as MedplumRefreshTokenClaims;
  } catch (err) {
    return sendTokenError(res, 'invalid_request', 'Invalid refresh token');
  }

  const [loginOutcome, login] = await repo.readResource<Login>('Login', claims.login_id);
  if (!isOk(loginOutcome) || !login) {
    return sendTokenError(res, 'invalid_request', 'Invalid token');
  }

  if (login.refreshSecret !== claims.refresh_secret) {
    return sendTokenError(res, 'invalid_request', 'Invalid token');
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (!authHeader.startsWith('Basic ')) {
      return sendTokenError(res, 'invalid_request', 'Invalid authorization header');
    }
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [clientId, clientSecret] = credentials.split(':');
    if (clientId !== getReferenceIdPart(login.client)) {
      return sendTokenError(res, 'invalid_grant', 'Incorrect client');
    }
    if (!clientSecret) {
      return sendTokenError(res, 'invalid_grant', 'Incorrect client secret');
    }
  }

  const [tokenOutcome, token] = await getAuthTokens(login);
  if (!isOk(tokenOutcome)) {
    return sendTokenError(res, 'invalid_request', 'Invalid token');
  }

  if (!token) {
    return sendTokenError(res, 'invalid_request', 'Invalid token');
  }

  return res.status(200).json({
    token_type: 'Bearer',
    scope: login.scope,
    expires_in: 3600,
    id_token: token.idToken,
    access_token: token.accessToken,
    refresh_token: token.refreshToken
  });
}

/**
 * Sends an OAuth2 response.
 * @param res The HTTP response.
 * @param error The error code.  See: https://datatracker.ietf.org/doc/html/rfc6749#appendix-A.7
 * @param description The error description.  See: https://datatracker.ietf.org/doc/html/rfc6749#appendix-A.8
 * @returns Reference to the HTTP response.
 */
function sendTokenError(res: Response, error: string, description?: string): Response<any, Record<string, any>> {
  return res.status(400).json({
    error,
    error_description: description
  });
}

/**
 * Verifies the code challenge and verifier.
 * @param challenge The code_challenge from the authorization.
 * @param method The code_challenge_method from the authorization.
 * @param verifier The code_verifier from the token request.
 * @returns True if the verifier succeeds; false otherwise.
 */
function verifyCode(challenge: string, method: string, verifier: string): boolean {
  if (method === 'plain' && challenge === verifier) {
    return true;
  }

  if (method === 'S256' && challenge === hashCode(verifier)) {
    return true;
  }

  return false;
}

/**
 * Returns the base64-url-encoded SHA256 hash of the code.
 * The details around '+', '/', and '=' are important for compatibility.
 * See: https://auth0.com/docs/flows/call-your-api-using-the-authorization-code-flow-with-pkce
 * @param code The input code.
 * @returns The base64-url-encoded SHA256 hash.
 */
export function hashCode(code: string): string {
  return createHash('sha256')
    .update(code)
    .digest()
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
