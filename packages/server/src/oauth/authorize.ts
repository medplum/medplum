import { ClientApplication, Login, OperationOutcome } from '@medplum/core';
import { Request, Response } from 'express';
import { asyncWrap } from '../async';
import { isOk, repo } from '../fhir';
import { logger } from '../logger';
import { renderTemplate } from '../templates';
import { MedplumIdTokenClaims, verifyJwt } from './keys';
import { getJsonDate, tryLogin } from './utils';

/*
 * Handles the OAuth/OpenID Authorization Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
 */

export const authorizeGetHandler = asyncWrap(async (req: Request, res: Response) => {
  const validateResult = await validateAuthorizeRequest(req, res);
  if (!validateResult) {
    return;
  }

  renderTemplate(res, 'login', buildView());
});

export const authorizePostHandler = asyncWrap(async (req: Request, res: Response) => {
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
});


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
