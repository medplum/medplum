import { badRequest } from '@medplum/core';
import { OperationOutcome, Project } from '@medplum/fhirtypes';
import { Router } from 'express';
import { asyncWrap } from '../async';
import { authenticateRequest } from '../oauth/middleware';
import { changePasswordHandler, changePasswordValidator } from './changepassword';
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
authRouter.post('/method', methodValidator, asyncWrap(methodHandler));
authRouter.get('/external', asyncWrap(externalCallbackHandler));
authRouter.get('/me', authenticateRequest, asyncWrap(meHandler));
authRouter.post('/newuser', newUserValidator, validateRecaptcha(projectRegistrationAllowed), asyncWrap(newUserHandler));
authRouter.post('/newproject', newProjectValidator, asyncWrap(newProjectHandler));
authRouter.post('/newpatient', newPatientValidator, asyncWrap(newPatientHandler));
authRouter.post('/login', loginValidator, asyncWrap(loginHandler));
authRouter.post('/profile', profileValidator, asyncWrap(profileHandler));
authRouter.post('/scope', scopeValidator, asyncWrap(scopeHandler));
authRouter.post('/changepassword', authenticateRequest, changePasswordValidator, asyncWrap(changePasswordHandler));
authRouter.post('/resetpassword', resetPasswordValidator, validateRecaptcha(), asyncWrap(resetPasswordHandler));
authRouter.post('/setpassword', setPasswordValidator, asyncWrap(setPasswordHandler));
authRouter.post('/verifyemail', verifyEmailValidator, asyncWrap(verifyEmailHandler));
authRouter.post('/google', googleValidator, asyncWrap(googleHandler));
authRouter.post('/exchange', exchangeValidator, asyncWrap(exchangeHandler));
authRouter.post('/revoke', authenticateRequest, revokeValidator, asyncWrap(revokeHandler));
authRouter.get('/login/:login', statusValidator, asyncWrap(statusHandler));

function projectRegistrationAllowed(project: Project): OperationOutcome | undefined {
  if (!project.defaultPatientAccessPolicy) {
    return badRequest('Project does not allow open registration');
  }
  return undefined;
}
