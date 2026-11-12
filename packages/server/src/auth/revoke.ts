// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, getReferenceString, notFound, Operator, resolveId } from '@medplum/core';
import type { Login, ProjectMembership } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { getLogger } from '../logger';
import { revokeLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { canManageUserAccount, getCallerUserReference } from './utils';

export const revokeValidator = makeValidationMiddleware([
  body('loginId').isUUID().withMessage('Login ID is required.'),
]);

export async function revokeHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const userRef = getCallerUserReference(ctx);

  const systemRepo = getGlobalSystemRepo();
  const login = await systemRepo.readResource<Login>('Login', req.body.loginId);

  // Make sure the login belongs to the current user
  if (login.user?.reference !== userRef.reference) {
    sendOutcome(res, notFound);
    return;
  }

  // Other logins can only revoke sessions in the current project
  if (!canManageUserAccount(ctx.authState.login)) {
    const loginMembership =
      login.membership &&
      (await systemRepo.searchOne<ProjectMembership>({
        resourceType: 'ProjectMembership',
        filters: [
          { code: '_id', operator: Operator.EQUALS, value: resolveId(login.membership) as string },
          { code: 'project', operator: Operator.EQUALS, value: getReferenceString(ctx.project) },
        ],
      }));
    if (!loginMembership) {
      getLogger().warn('Revoke denied', {
        loginId: login.id,
        projectId: ctx.project.id,
        authMethod: ctx.authState.login.authMethod,
      });
      sendOutcome(res, notFound);
      return;
    }
  }

  // Mark the login as revoked
  await revokeLogin(systemRepo, login);

  sendOutcome(res, allOk);
}
