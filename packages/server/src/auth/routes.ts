import { Router } from 'express';
import { asyncWrap } from '../async';
import { changePasswordHandler, changePasswordValidators } from './changepassword';
import { googleHandler, googleValidators } from './google';
import { loginHandler, loginValidators } from './login';
import { registerHandler, registerValidators } from './register';
import { resetPasswordHandler, resetPasswordValidators } from './resetpassword';

export const authRouter = Router();
authRouter.post('/register', registerValidators, asyncWrap(registerHandler));
authRouter.post('/login', loginValidators, asyncWrap(loginHandler));
authRouter.post('/changepassword', changePasswordValidators, asyncWrap(changePasswordHandler));
authRouter.post('/resetpassword', resetPasswordValidators, asyncWrap(resetPasswordHandler));
authRouter.post('/google', googleValidators, asyncWrap(googleHandler));
