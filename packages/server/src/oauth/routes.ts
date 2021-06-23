import { ClientApplication, Login, OperationOutcome } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { badRequest, isOk, repo, sendOutcome } from '../fhir';
import { logger } from '../logger';
import { renderTemplate } from '../templates';
import { generateAccessToken, MedplumIdTokenClaims, MedplumRefreshTokenClaims, verifyJwt } from './keys';
import { authenticateToken } from './middleware';
import { getAuthTokens, getJsonDate, getReferenceIdPart, revokeLogin, tryLogin } from './utils';

export const oauthRouter = Router();

/**
 * Handles the OAuth/OpenID Authorization Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
 */
oauthRouter.get('/authorize', asyncWrap(async (req: Request, res: Response) => {
  const validateResult = await validateAuthorizeRequest(req, res);
  if (!validateResult) {
    return;
  }

  renderTemplate(res, 'login', buildView());
}));

/**
 * Handles the OAuth/OpenID Authorization Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
 */
oauthRouter.post('/authorize', asyncWrap(async (req: Request, res: Response) => {
  const validateResult = await validateAuthorizeRequest(req, res);
  if (!validateResult) {
    return;
  }

  const [outcome, login] = await tryLogin({
    clientId: req.query.client_id as string,
    scope: req.query.scope as string,
    nonce: req.query.nonce as string,
    email: req.body.email as string,
    password: req.body.password as string,
    role: 'practitioner',
    remember: true
  });

  if (!isOk(outcome)) {
    return renderTemplate(res, 'login', buildView(outcome));
  }

  const cookieName = 'medplum-' + req.query.client_id;
  res.cookie(cookieName, login?.id as string, { httpOnly: true });

  const redirectUrl = new URL(req.query.redirect_uri as string);
  redirectUrl.searchParams.append('code', login?.id as string);
  redirectUrl.searchParams.append('state', req.query.state as string);
  res.redirect(redirectUrl.toString());
}));

/**
 * Validates the OAuth/OpenID Authorization Endpoint configuration.
 * This is used for both GET and POST requests.
 * We currently only support query string parameters.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
 */
async function validateAuthorizeRequest(req: Request, res: Response): Promise<boolean> {
  // First validate the client and the redirect URI.
  // If these are invalid, then show an error page.
  const [clientOutcome, client] = await repo.readResource<ClientApplication>('ClientApplication', req.query.client_id as string);
  if (!isOk(clientOutcome)) {
    res.status(400).send('Error reading client');
    return false;
  }

  if (!client) {
    res.status(400).send('Client not found');
    return false;
  }

  if (client.redirectUri !== req.query.redirect_uri) {
    res.status(400).send('Incorrect redirect_uri');
    return false;
  }

  let existingLoginId: string | undefined;
  let existingLogin: Login | undefined;

  const cookieName = 'medplum-' + client.id;
  const cookieLoginId = req.cookies[cookieName];
  if (cookieLoginId) {
    existingLoginId = cookieLoginId;
  }

  const idTokenHint = req.query.id_token_hint as string | undefined;
  if (idTokenHint) {
    try {
      const verifyResult = await verifyJwt(idTokenHint);
      const claims = verifyResult.payload as MedplumIdTokenClaims;
      existingLoginId = claims.login_id as string | undefined;
    } catch (err) {
      logger.debug('Error verifying id_token_hint', err);
    }
  }

  if (existingLoginId) {
    const [existingOutcome, existing] = await repo.readResource<Login>('Login', existingLoginId);
    if (isOk(existingOutcome) && existing) {
      const authTime = getJsonDate(existing.authTime) as Date;
      const age = (Date.now() - authTime.getTime()) / 1000;
      const maxAge = req.query.max_age ? parseInt(req.query.max_age as string) : 3600;
      if (age <= maxAge) {
        existingLogin = existing as Login;
      }
    }
  }

  // Then, validate all other parameters.
  // If these are invalid, redirect back to the redirect URI.
  const responseType = req.query.response_type;
  if (responseType !== 'code') {
    sendErrorRedirect(res, client.redirectUri as string, 'unsupported_response_type', req.query.state as string);
    return false;
  }

  const requestObject = req.query.request as string | undefined;
  if (requestObject) {
    sendErrorRedirect(res, client.redirectUri as string, 'request_not_supported', req.query.state as string);
    return false;
  }

  const prompt = req.query.prompt as string | undefined;
  if (prompt === 'none' && !existingLogin) {
    sendErrorRedirect(res, client.redirectUri as string, 'login_required', req.query.state as string);
    return false;
  }

  if (prompt !== 'login' && existingLogin) {
    await repo.updateResource<Login>({
      ...existingLogin,
      nonce: req.query.nonce as string,
      granted: false
    });

    const redirectUrl = new URL(req.query.redirect_uri as string);
    redirectUrl.searchParams.append('code', existingLogin?.id as string);
    redirectUrl.searchParams.append('state', req.query.state as string);
    res.redirect(redirectUrl.toString());
    return false;
  }

  return true;
}

/**
 * Sends a redirect back to the client application with error codes and state.
 * @param res The response.
 * @param redirectUri The client redirect URI.  This URI may already have query string parameters.
 * @param error The OAuth/OpenID error code.
 * @param state The client state.
 */
function sendErrorRedirect(res: Response, redirectUri: string, error: string, state: string): void {
  const url = new URL(redirectUri as string);
  url.searchParams.append('error', error);
  url.searchParams.append('state', state);
  res.redirect(url.toString());
}

/**
 * Handles the OAuth/OpenID Token Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint
 */
oauthRouter.post('/token', asyncWrap(async (req: Request, res: Response) => {
  if (!req.is('application/x-www-form-urlencoded')) {
    return res.status(400).send('Unsupported content type');
  }

  const grantType = req.body.grant_type;
  if (!grantType) {
    return sendOutcome(res, badRequest('Missing grant_type'));
  }

  switch (grantType) {
    case 'client_credentials':
      return handleClientCredentials(req, res);
    case 'authorization_code':
      return handleAuthorizationCode(req, res);
    case 'refresh_token':
      return handleRefreshToken(req, res);
    default:
      return sendOutcome(res, badRequest('Unsupported grant_type'));
  }
}));

oauthRouter.get('/logout', (req: Request, res: Response) => {
  for (const name of Object.keys(req.cookies)) {
    if (name.startsWith('medplum-')) {
      res.clearCookie(name);
    }
  }
  res.sendStatus(200);
});

oauthRouter.post('/logout', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.get('/userinfo', authenticateToken, (req: Request, res: Response) => {
  const userInfo: Record<string, any> = {
    sub: res.locals.user
  };

  if (res.locals.scope.includes('profile')) {
    userInfo.profile = res.locals.profile;
    userInfo.name = 'foo';
    userInfo.website = '';
    userInfo.zoneinfo = '';
    userInfo.birthdate = '1990-01-01';
    userInfo.gender = '';
    userInfo.preferred_username = '';
    userInfo.given_name = '';
    userInfo.middle_name = '';
    userInfo.family_name = '';
    userInfo.locale = 'en-US';
    userInfo.picture = '';
    userInfo.updated_at = Date.now() / 1000;
    userInfo.nickname = '';
  }

  if (res.locals.scope.includes('email')) {
    userInfo.email = 'foo@example.com';
    userInfo.email_verified = true;
  }

  res.status(200).json(userInfo);
});

oauthRouter.post('/userinfo', authenticateToken, (req: Request, res: Response) => {
  res.status(200).json({
    sub: res.locals.user
  });
});

oauthRouter.get('/register', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.post('/register', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.get('/role', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.post('/role', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.get('/scopes', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.post('/scopes', (req: Request, res: Response) => {
  res.sendStatus(200);
});

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
  if (!isOk(readOutcome)) {
    return sendOutcome(res, readOutcome);
  }

  if (!client) {
    return sendTokenError(res, 'invalid_request', 'Invalid client');
  }

  if (!client.secret) {
    return sendTokenError(res, 'invalid_request', 'Invalid client');
  }

  if (client.secret !== clientSecret) {
    return sendTokenError(res, 'invalid_request', 'Invalid secret');
  }

  const scope = req.body.scope as string;
  const accessToken = await generateAccessToken({
    login_id: '', // TODO
    sub: client.id as string,
    username: client.id as string,
    client_id: client.id as string,
    profile: client.resourceType + '/' + client.id,
    scope: scope
  });

  return res.status(200).json({
    token_type: 'Bearer',
    access_token: accessToken,
    expires_in: 3600,
    scope
  });
}

async function handleAuthorizationCode(req: Request, res: Response): Promise<Response> {
  const code = req.body.code;
  if (!code) {
    return sendTokenError(res, 'invalid_request', 'Missing code');
  }

  const [loginOutcome, login] = await repo.readResource<Login>('Login', code);
  if (!isOk(loginOutcome)) {
    return sendTokenError(res, 'invalid_request', 'Invalid code');
  }

  if (!login) {
    return sendTokenError(res, 'invalid_request', 'Invalid code');
  }

  if (login.granted) {
    await revokeLogin(login);
    return sendTokenError(res, 'invalid_grant', 'Token already granted');
  }

  if (login.revoked) {
    return sendTokenError(res, 'invalid_grant', 'Token revoked');
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

  const authHeader = req.headers.authorization as string | undefined;
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

function buildView(outcome?: OperationOutcome): any {
  const view = {
    title: 'Sign In',
    errors: {} as Record<string, string[]>
  };

  if (outcome) {
    outcome.issue?.forEach(issue => {
      const param = issue.expression?.[0] as string;
      if (!view.errors[param]) {
        view.errors[param] = [];
      }
      view.errors[param].push(issue.details?.text as string);
    });
  }

  return view;
}

function sendTokenError(res: Response, error: string, description?: string): Response<any, Record<string, any>> {
  return res.status(400).json({
    error,
    error_description: description
  });
}
