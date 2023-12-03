import { OAuthTokenType } from '@medplum/core';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { exchangeExternalAuthToken } from '../oauth/token';
import { makeValidationMiddleware } from '../util/validator';

/*
 * Exchange an access token from an external auth provider for a Medplum access token.
 * This requires that the client application has been configured with the external auth provider.
 *
 * Deprecated. Use /oauth2/token with grant_type of "urn:ietf:params:oauth:grant-type:token-exchange" instead.
 */

export const exchangeValidator = makeValidationMiddleware([
  body('externalAccessToken').notEmpty().withMessage('Missing externalAccessToken'),
  body('clientId').notEmpty().withMessage('Missing clientId'),
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
