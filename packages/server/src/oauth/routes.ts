import { Request, Response, Router } from 'express';
import { body, query, Result, ValidationError, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { getConfig } from '../config';
import { invalidRequest, isOk, repo, sendOutcome } from '../fhir';
import { renderTemplate } from '../templates';
import { getJwks } from './keys';

export const oauthRouter = Router();

oauthRouter.get('/.well-known/jwks.json', (req: Request, res: Response) => {
  const jwks = getJwks();
  res.status(200).json(jwks);
});

oauthRouter.post(
  '/authorize',
  query('response_type').notEmpty().withMessage('Missing response_type'),
  query('response_type').equals('code').withMessage('Invalid response_type'),
  query('client_id').notEmpty().withMessage('Missing client_id'),
  query('redirect_uri').notEmpty().withMessage('Missing redirect_uri'),
  query('state').notEmpty().withMessage('Missing state'),
  query('scope').notEmpty().withMessage('Missing scope'),
  asyncWrap(async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendOutcome(res, invalidRequest(errors));
    }

    const [outcome] = await repo.readResource('ClientApplication', req.query.client_id as string);
    if (!isOk(outcome)) {
      return sendOutcome(res, outcome);
    }

    const url = new URL(getConfig().baseUrl + 'oauth2/login');
    const params = url.searchParams;
    params.append('response_type', req.query.response_type as string);
    params.append('client_id', req.query.client_id as string);
    params.append('redirect_uri', req.query.redirect_uri as string);
    params.append('state', req.query.state as string);
    params.append('scope', req.query.scope as string);
    res.redirect(url.href);
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

    renderTemplate(res, 'login');
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
  (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return renderTemplate(res, 'login', buildView(errors));
    }

    const view = {};
    renderTemplate(res, 'login', view);
  });

oauthRouter.post('/token', (req: Request, res: Response) => {
  res.sendStatus(200);
});

oauthRouter.post('/userinfo', (req: Request, res: Response) => {
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

function buildView(validationResult: Result<ValidationError>): any {
  const view = {
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
