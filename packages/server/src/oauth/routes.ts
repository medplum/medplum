import { ClientApplication, Login } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, query, Result, ValidationError, validationResult } from 'express-validator';
import { JWSHeaderParameters, JWTPayload } from 'jose/webcrypto/types';
import { asyncWrap } from '../async';
import { badRequest, isOk, repo, sendOutcome } from '../fhir';
import { renderTemplate } from '../templates';
import { generateAccessToken, verifyJwt } from './keys';
import { getAuthTokens, tryLogin } from './login';
import { authenticateToken } from './middleware';

export const oauthRouter = Router();

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

oauthRouter.get('/authorize', asyncWrap(async (req: Request, res: Response) => {
  const responseType = req.query.response_type as string | undefined;
  if (responseType !== 'code') {
    return res.status(400).send('Unsupported response type');
  }

  const clientId = req.query.client_id as string | undefined;
  if (!clientId) {
    return res.status(400).send('Missing client_id');
  }

  const redirectUri = req.query.redirect_uri as string | undefined;
  if (!redirectUri) {
    return res.status(400).send('Missing redirect_uri');
  }

  const state = req.query.state as string | undefined;
  if (!state) {
    return res.status(400).send('Missing state');
  }

  const scope = req.query.scope as string | undefined;
  if (!scope) {
    return res.status(400).send('Missing scope');
  }

  const prompt = req.query.prompt as string | undefined;
  if (prompt === 'none') {
    return res.redirect(redirectUri + '?' + new URLSearchParams({
      error: 'login_required',
      state
    }).toString());
  }

  const [outcome, client] = await repo.readResource<ClientApplication>('ClientApplication', clientId);
  if (!isOk(outcome)) {
    return res.status(400).send('Error reading client');
  }

  if (!client) {
    return res.status(400).send('Client not found');
  }

  if (client.redirectUri !== redirectUri) {
    return res.status(400).send('Mismatched redirect_uri');
  }

  const params = new URLSearchParams({
    response_type: responseType,
    client_id: clientId,
    redirect_uri: redirectUri,
    nonce: req.query.nonce as string,
    state,
    scope
  });

  res.redirect('/oauth2/login?' + params.toString());
}));

oauthRouter.get('/login',
  query('response_type').notEmpty().withMessage('Missing response_type'),
  query('response_type').equals('code').withMessage('Invalid response_type'),
  query('client_id').notEmpty().withMessage('Missing client_id'),
  query('redirect_uri').notEmpty().withMessage('Missing redirect_uri'),
  query('state').notEmpty().withMessage('Missing state'),
  query('scope').notEmpty().withMessage('Missing scope'),
  (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return renderTemplate(res, 'login', buildView(errors));
    }

    const view = {
      title: 'Sign In'
    };

    renderTemplate(res, 'login', view);
  });

oauthRouter.post('/login',
  query('response_type').notEmpty().withMessage('Missing response_type'),
  query('response_type').equals('code').withMessage('Invalid response_type'),
  query('client_id').notEmpty().withMessage('Missing client_id'),
  query('redirect_uri').notEmpty().withMessage('Missing redirect_uri'),
  query('state').notEmpty().withMessage('Missing state'),
  query('scope').notEmpty().withMessage('Missing scope'),
  body('email').notEmpty().withMessage('Missing email'),
  body('password').notEmpty().withMessage('Missing password'),
  asyncWrap(async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return renderTemplate(res, 'login', buildView(errors));
    }

    const [outcome, result] = await tryLogin({
      clientId: req.query.client_id as string,
      scope: req.query.scope as string,
      nonce: req.query.nonce as string,
      email: req.body.email as string,
      password: req.body.password as string,
      role: 'practitioner',
      remember: true
    });

    if (!isOk(outcome)) {
      return renderTemplate(res, 'login', buildView(errors));
    }

    const redirectUrl = new URL(req.query.redirect_uri as string);
    redirectUrl.searchParams.append('code', result?.id as string);
    redirectUrl.searchParams.append('state', req.query.state as string);
    res.redirect(redirectUrl.toString());
  }));

oauthRouter.get('/logout', (req: Request, res: Response) => {
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
    return sendOutcome(res, badRequest('Missing client_id'));
  }

  const clientSecret = req.body.client_secret;
  if (!clientSecret) {
    return sendOutcome(res, badRequest('Missing client_secret'));
  }

  const [readOutcome, client] = await repo.readResource<ClientApplication>('ClientApplication', clientId);
  if (!isOk(readOutcome)) {
    return sendOutcome(res, readOutcome);
  }

  if (!client) {
    return sendOutcome(res, badRequest('Client not found'));
  }

  if (!client.secret) {
    return sendOutcome(res, badRequest('Invalid client'));
  }

  if (client.secret !== clientSecret) {
    return sendOutcome(res, badRequest('Invalid secret'));
  }

  const scope = req.body.scope as string;
  const accessToken = await generateAccessToken({
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
    return sendOutcome(res, badRequest('Missing code'));
  }

  const [loginOutcome, login] = await repo.readResource<Login>('Login', code);
  if (!isOk(loginOutcome)) {
    return sendOutcome(res, loginOutcome);
  }

  if (!login) {
    return sendOutcome(res, badRequest('Invalid token'));
  }

  const [tokenOutcome, token] = await getAuthTokens(login);
  if (!isOk(tokenOutcome)) {
    return sendOutcome(res, tokenOutcome);
  }

  if (!token) {
    return sendOutcome(res, badRequest('Invalid token'));
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
    return sendOutcome(res, badRequest('Missing refresh_token'));
  }

  let claims: { payload: JWTPayload, protectedHeader: JWSHeaderParameters };
  try {
    claims = await verifyJwt(refreshToken);
  } catch (err) {
    return sendOutcome(res, badRequest('Invalid refresh_token'));
  }

  const { payload, protectedHeader } = claims;
  console.log('payload', payload);
  console.log('protectedHeaders', protectedHeader);

  return sendOutcome(res, badRequest('Not implemented'));
}

function buildView(validationResult: Result<ValidationError>): any {
  const view = {
    title: 'Sign In',
    errors: {} as Record<string, ValidationError[]>
  };

  validationResult.array().forEach(error => {
    const param = error.location === 'query' ? 'query' : error.param as string;
    if (!view.errors[param]) {
      view.errors[param] = [];
    }
    view.errors[param].push(error);
  });

  return view;
}
