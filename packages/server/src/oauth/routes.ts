import { ClientApplication } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { badRequest, isOk, repo, sendOutcome } from '../fhir';
import { generateJwt } from './keys';

export const oauthRouter = Router();

oauthRouter.post('/authorize', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.post('/token', asyncWrap(async (req: Request, res: Response) => {
  if (!req.is('application/x-www-form-urlencoded')) {
    return res.status(400).send('Unsupported content type');
  }

  const grantType = req.body.grant_type;
  if (!grantType) {
    return sendOutcome(res, badRequest('Missing grant_type'));
  }

  switch (grantType) {
    case 'authorization_code':
      return handleAuthorizationCode(req, res);
    case 'client_credentials':
      return handleClientCredentials(req, res);
    case 'refresh_token':
      return handleRefreshToken(req, res);
    default:
      return sendOutcome(res, badRequest('Unsupported grant_type'));
  }
}));

oauthRouter.post('/userinfo', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.get('/login', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.post('/login', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.get('/logout', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.post('/logout', (req: Request, res: Response) => {
  res.sendStatus(200);
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
  const accessToken = await generateJwt('1h', {
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
  return sendOutcome(res, badRequest('Not implemented'));
}

async function handleRefreshToken(req: Request, res: Response): Promise<Response> {
  return sendOutcome(res, badRequest('Not implemented'));
}
