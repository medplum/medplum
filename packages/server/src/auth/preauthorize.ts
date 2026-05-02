// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, createReference, forbidden, OperationOutcomeError, parseReference } from '@medplum/core';
import type { ClientApplication, Login } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { createHash, randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../context';
import { generateSecret } from '../oauth/keys';
import { makeValidationMiddleware } from '../util/validator';

export const preAuthorizeValidator = makeValidationMiddleware([
  body('clientId').isUUID().withMessage('Client ID is required'),
]);

export async function preAuthorizeHandler(req: Request, res: Response): Promise<void> {
  const { authState, repo } = getAuthenticatedContext();

  const { project, membership, onBehalfOfMembership } = authState;
  if (!membership.admin) {
    throw new OperationOutcomeError(forbidden);
  }

  if (!onBehalfOfMembership) {
    throw new OperationOutcomeError(badRequest('Pre-authorization requires onBehalfOfMembership'));
  }

  const preAuthorizedCode = generateSecret(128);
  const preAuthorizedCodeHash = createHash('sha256').update(preAuthorizedCode).digest('hex');
  const client = await repo.readResource<ClientApplication>('ClientApplication', req.body.clientId);
  const [resourceType, _id] = parseReference(onBehalfOfMembership.profile);
  await repo.getSystemRepo().createResource<Login>({
    resourceType: 'Login',
    authMethod: 'pre-authorized',
    project: createReference(project),
    client: createReference(client),
    profileType: resourceType,
    membership: createReference(onBehalfOfMembership),
    user: onBehalfOfMembership.user,
    authTime: new Date().toISOString(),
    preAuthorizedCodeHash,
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
  res.status(200).json({ preAuthorizedCode });
}
