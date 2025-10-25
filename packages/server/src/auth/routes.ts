// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest } from '@medplum/core';
import type { OperationOutcome, Project } from '@medplum/fhirtypes';
import { Router } from 'express';
import { authenticateRequest } from '../oauth/middleware';
import { changePasswordHandler, changePasswordValidator } from './changepassword';
import { clientInfoHandler } from './clientinfo';
import { exchangeHandler, exchangeValidator } from './exchange';
import { externalCallbackHandler } from './external';
import { googleHandler, googleValidator } from './google';
import { loginHandler, loginValidator } from './login';
import { meHandler } from './me';
import { methodHandler, methodValidator } from './method';
import { mfaRouter } from './mfa';
import { newPatientHandler, newPatientValidator } from './newpatient';
import { newProjectHandler, newProjectValidator } from './newproject';
import { newUserHandler, newUserValidator } from './newuser';
import { profileHandler, profileValidator } from './profile';
import { resetPasswordHandler, resetPasswordValidator } from './resetpassword';
import { revokeHandler, revokeValidator } from './revoke';
import { scopeHandler, scopeValidator } from './scope';
import { setPasswordHandler, setPasswordValidator } from './setpassword';
import { statusHandler, statusValidator } from './status';
import { validateRecaptcha } from './utils';
import { verifyEmailHandler, verifyEmailValidator } from './verifyemail';

export const authRouter = Router();
authRouter.use('/mfa', mfaRouter);
authRouter.post('/method', methodValidator, methodHandler);
authRouter.get('/external', externalCallbackHandler);
authRouter.get('/me', authenticateRequest, meHandler);
authRouter.post('/newuser', newUserValidator, validateRecaptcha(projectRegistrationAllowed), newUserHandler);
authRouter.post('/newproject', newProjectValidator, newProjectHandler);
authRouter.post('/newpatient', newPatientValidator, newPatientHandler);
authRouter.post('/login', loginValidator, loginHandler);
authRouter.post('/profile', profileValidator, profileHandler);
authRouter.post('/scope', scopeValidator, scopeHandler);
authRouter.post('/changepassword', authenticateRequest, changePasswordValidator, changePasswordHandler);
authRouter.post('/resetpassword', resetPasswordValidator, validateRecaptcha(), resetPasswordHandler);
authRouter.post('/setpassword', setPasswordValidator, setPasswordHandler);
authRouter.post('/verifyemail', verifyEmailValidator, verifyEmailHandler);
authRouter.post('/google', googleValidator, googleHandler);
authRouter.post('/exchange', exchangeValidator, exchangeHandler);
authRouter.post('/revoke', authenticateRequest, revokeValidator, revokeHandler);
authRouter.get('/login/:login', statusValidator, statusHandler);
authRouter.get('/clientinfo/:clientId', clientInfoHandler);

function projectRegistrationAllowed(project: Project): OperationOutcome | undefined {
  if (!project.defaultPatientAccessPolicy) {
    return badRequest('Project does not allow open registration');
  }
  return undefined;
}
