// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, createReference, forbidden, OperationOutcomeError } from '@medplum/core';
import type { ClientApplication, Login } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { createHash, randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../context';
import { generateSecret } from '../oauth/keys';
import { makeValidationMiddleware } from '../util/validator';

export const DEFAULT_PRE_AUTH_CODE_TTL = 60 * 60; // 1 hour
export const MAX_PRE_AUTH_CODE_TTL = 7 * 24 * 60 * 60; // 7 days

export const preAuthorizeValidator = makeValidationMiddleware([
  body('clientId').isUUID().withMessage('Client ID is required'),
  body('scope').optional().isString().withMessage('Scope must be a string'),
  body('nonce').optional().isString().withMessage('Nonce must be a string'),
  body('expiresIn')
    .optional()
    .isInt({ min: 1, max: MAX_PRE_AUTH_CODE_TTL })
    .withMessage(`expiresIn must be a positive integer not exceeding ${MAX_PRE_AUTH_CODE_TTL} seconds`),
]);

export async function preAuthorizeHandler(req: Request, res: Response): Promise<void> {
  const { authState, repo } = getAuthenticatedContext();
  const { project, membership, onBehalfOfMembership } = authState;
  if (project.superAdmin || !membership.admin) {
    throw new OperationOutcomeError(forbidden);
  }
  if (!onBehalfOfMembership) {
    throw new OperationOutcomeError(badRequest('Pre-authorization requires onBehalfOfMembership'));
  }

  const preAuthorizedCode = generateSecret(128);
  const preAuthorizedCodeHash = createHash('sha256').update(preAuthorizedCode).digest('hex');
  const expiresIn = req.body.expiresIn ?? DEFAULT_PRE_AUTH_CODE_TTL;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const client = await repo.readResource<ClientApplication>('ClientApplication', req.body.clientId);
  await repo.getSystemRepo().createResource<Login>({
    resourceType: 'Login',
    authMethod: 'pre-authorized',
    project: createReference(project),
    client: createReference(client),
    membership: createReference(onBehalfOfMembership),
    user: onBehalfOfMembership.user,
    authTime: new Date().toISOString(),
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
    preAuthorizedCodeHash,
    expiresAt,
  });
  res.status(200).json({ preAuthorizedCode, expiresAt });
}
