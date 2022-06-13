import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authorizeGetHandler } from './authorize';
import { authenticateToken } from './middleware';
import { tokenHandler } from './token';
import { userInfoHandler } from './userinfo';

export const oauthRouter = Router();
oauthRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  })
);

oauthRouter.get('/authorize', authorizeGetHandler);
oauthRouter.post('/token', tokenHandler);
oauthRouter.get('/userinfo', authenticateToken, userInfoHandler);
oauthRouter.post('/userinfo', authenticateToken, userInfoHandler);

oauthRouter.get('/logout', (req: Request, res: Response) => {
  for (const name of Object.keys(req.cookies)) {
    if (name.startsWith('medplum-')) {
      res.clearCookie(name);
    }
  }
  res.sendStatus(200);
});

oauthRouter.post('/logout', (_req: Request, res: Response) => {
  res.sendStatus(200);
});
