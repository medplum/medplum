import { badRequest, OperationOutcomeError, ProfileResource } from '@medplum/core';
import { ClientApplication, IdentityProvider, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import fetch from 'node-fetch';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { getAuthTokens, tryLogin } from '../oauth/utils';

/*
 * Exchange an access token from an external auth provider for a Medplum access token.
 * This requires that the client application has been configured with the external auth provider.
 */

export const exchangeValidators = [
  body('externalAccessToken').notEmpty().withMessage('Missing externalAccessToken'),
  body('projectId').notEmpty().withMessage('Missing projectId'),
  body('clientId').notEmpty().withMessage('Missing clientId'),
];

export const exchangeHandler = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const externalAccessToken = req.body.externalAccessToken as string;
  const projectId = req.body.projectId as string;
  const clientId = req.body.clientId as string;

  const client = await systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
  if (projectId !== client.meta?.project) {
    sendOutcome(res, badRequest('Invalid project'));
    return;
  }

  const idp = client.identityProvider;
  if (!idp) {
    sendOutcome(res, badRequest('Identity provider not found'));
    return;
  }

  const userInfo = await getExternalUserInfo(idp, externalAccessToken);

  let email: string | undefined = undefined;
  let externalId: string | undefined = undefined;
  if (idp.useSubject) {
    externalId = userInfo.sub as string;
  } else {
    email = userInfo.email as string;
  }

  const login = await tryLogin({
    authMethod: 'exchange',
    email,
    externalId,
    projectId,
    clientId,
    scope: req.body.scope || 'openid offline',
    nonce: req.body.nonce || randomUUID(),
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const membership = await systemRepo.readReference<ProjectMembership>(
    login.membership as Reference<ProjectMembership>
  );

  const tokens = await getAuthTokens(login, membership.profile as Reference<ProfileResource>);
  res.status(200).json({
    token_type: 'Bearer',
    expires_in: 3600,
    scope: login.scope,
    id_token: tokens.idToken,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    project: membership.project,
    profile: membership.profile,
  });
};

/**
 * Returns the external identity provider user info for an access token.
 * This can be used to verify the access token and get the user's email address.
 * @param idp The identity provider configuration.
 * @param externalAccessToken The external identity provider access token.
 * @returns The user info claims.
 */
async function getExternalUserInfo(
  idp: IdentityProvider,
  externalAccessToken: string
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(idp.userInfoUrl as string, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${externalAccessToken}`,
      },
    });

    return await response.json();
  } catch (err) {
    logger.warn('Failed to verify code', err);
    throw new OperationOutcomeError(badRequest('Failed to verify code - check your identity provider configuration'));
  }
}
