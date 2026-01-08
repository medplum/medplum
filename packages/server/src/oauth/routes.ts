// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import cookieParser from 'cookie-parser';
import { Router } from 'express';
import { authorizeGetHandler, authorizePostHandler } from './authorize';
import { tokenIntrospectHandler } from './introspect';
import { logoutHandler } from './logout';
import { authenticateRequest } from './middleware';
import { registerHandler } from './register';
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
oauthRouter.post('/introspect', tokenIntrospectHandler);
oauthRouter.post('/register', registerHandler);
