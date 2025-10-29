// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, resolveId } from '@medplum/core';
import type { Request, Response } from 'express';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { revokeLogin } from '../oauth/utils';

export const logoutHandler = async (_req: Request, res: Response): Promise<void> => {
  const ctx = getAuthenticatedContext();

  // Mark the login as revoked
  await revokeLogin(getGlobalSystemRepo(), ctx.login);

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
};
