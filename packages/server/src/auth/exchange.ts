// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OAuthTokenType } from '@medplum/core';
import type { Request, Response } from 'express';
import { exchangeExternalAuthToken } from '../oauth/token';
import { makeValidationMiddleware, stringField } from '../util/validator';

/*
 * Exchange an access token from an external auth provider for a Medplum access token.
 * This requires that the client application has been configured with the external auth provider.
 *
 * Deprecated. Use /oauth2/token with grant_type of "urn:ietf:params:oauth:grant-type:token-exchange" instead.
 */

export const exchangeValidator = makeValidationMiddleware([
  stringField('externalAccessToken', 'Missing externalAccessToken').notEmpty(),
  stringField('clientId', 'Missing clientId').notEmpty(),
]);

export const exchangeHandler = async (req: Request, res: Response): Promise<void> => {
  return exchangeExternalAuthToken(
    req,
    res,
    req.body.clientId as string,
    req.body.externalAccessToken as string,
    OAuthTokenType.AccessToken
  );
};
