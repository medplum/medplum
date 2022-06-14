import { Router } from 'express';
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
