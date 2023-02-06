import cookieParser from 'cookie-parser';
import { Router } from 'express';
import { getRateLimiter } from '../ratelimit';
import { authorizeGetHandler, authorizePostHandler } from './authorize';
import { logoutHandler } from './logout';
import { authenticateToken } from './middleware';
import { tokenHandler } from './token';
import { userInfoHandler } from './userinfo';

export const oauthRouter = Router();
oauthRouter.use(getRateLimiter());
oauthRouter.get('/authorize', cookieParser(), authorizeGetHandler);
oauthRouter.post('/authorize', cookieParser(), authorizePostHandler);
oauthRouter.post('/token', tokenHandler);
oauthRouter.get('/userinfo', authenticateToken, userInfoHandler);
oauthRouter.post('/userinfo', authenticateToken, userInfoHandler);
oauthRouter.get('/logout', authenticateToken, logoutHandler);
oauthRouter.post('/logout', authenticateToken, logoutHandler);
