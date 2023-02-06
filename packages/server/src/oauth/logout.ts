import { allOk, resolveId } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../async';
import { sendOutcome } from '../fhir/outcomes';
import { revokeLogin } from '../oauth/utils';

export const logoutHandler = asyncWrap(async (req: Request, res: Response): Promise<void> => {
  // Get login from current session
  const login = res.locals.login as Login;

  // Mark the login as revoked
  await revokeLogin(login);

  if (login.client) {
    const cookieName = 'medplum-' + resolveId(login.client);
    res.clearCookie(cookieName, {
      maxAge: 3600 * 1000,
      sameSite: 'none',
      secure: true,
      httpOnly: true,
    });
  }

  sendOutcome(res, allOk);
});
