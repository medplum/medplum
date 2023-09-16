import { allOk, resolveId } from '@medplum/core';
import { Request, Response } from 'express';
import { asyncWrap } from '../async';
import { sendOutcome } from '../fhir/outcomes';
import { revokeLogin } from '../oauth/utils';
import { getAuthenticatedContext } from '../context';

export const logoutHandler = asyncWrap(async (req: Request, res: Response): Promise<void> => {
  const ctx = getAuthenticatedContext();

  // Mark the login as revoked
  await revokeLogin(ctx.login);

  if (ctx.login.client) {
    const cookieName = 'medplum-' + resolveId(ctx.login.client);
    res.clearCookie(cookieName, {
      maxAge: 3600 * 1000,
      sameSite: 'none',
      secure: true,
      httpOnly: true,
    });
  }

  sendOutcome(res, allOk);
});
