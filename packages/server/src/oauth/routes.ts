import cookieParser from 'cookie-parser';
import { Router } from 'express';
import { authorizeGetHandler, authorizePostHandler } from './authorize';
import { logoutHandler } from './logout';
import { authenticateRequest } from './middleware';
import { tokenHandler } from './token';
import { userInfoHandler } from './userinfo';

export const oauthRouter = Router();
oauthRouter.get('/authorize', cookieParser(), authorizeGetHandler);
oauthRouter.post('/authorize', cookieParser(), authorizePostHandler);
oauthRouter.post('/token', tokenHandler);
oauthRouter.get('/userinfo', authenticateRequest, userInfoHandler);
oauthRouter.post('/userinfo', authenticateRequest, userInfoHandler);
oauthRouter.get('/logout', authenticateRequest, logoutHandler);
oauthRouter.post('/logout', authenticateRequest, logoutHandler);
