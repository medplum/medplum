import cookieParser from 'cookie-parser';
import { Request, Response, Router } from 'express';
import { authorizeGetHandler, authorizePostHandler } from './authorize';
import { authenticateToken } from './middleware';
import { tokenHandler } from './token';

export const oauthRouter = Router();
oauthRouter.use(cookieParser()); // lgtm [js/missing-token-validation]
oauthRouter.get('/authorize', authorizeGetHandler);
oauthRouter.post('/authorize', authorizePostHandler);
oauthRouter.post('/token', tokenHandler);

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
