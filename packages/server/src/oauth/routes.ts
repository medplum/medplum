import { Router } from 'express';
import { getRateLimiter } from '../ratelimit';
import { authorizeGetHandler } from './authorize';
import { authenticateToken } from './middleware';
import { tokenHandler } from './token';
import { userInfoHandler } from './userinfo';

export const oauthRouter = Router();
oauthRouter.use(getRateLimiter());
oauthRouter.get('/authorize', authorizeGetHandler);
oauthRouter.post('/token', tokenHandler);
oauthRouter.get('/userinfo', authenticateToken, userInfoHandler);
oauthRouter.post('/userinfo', authenticateToken, userInfoHandler);
