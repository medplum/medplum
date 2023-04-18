import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { exchangeExternalAuthToken } from '../oauth/token';

/*
 * Exchange an access token from an external auth provider for a Medplum access token.
 * This requires that the client application has been configured with the external auth provider.
 *
 * Deprecated. Use /oauth2/token with grant_type of "urn:ietf:params:oauth:grant-type:token-exchange" instead.
 */

export const exchangeValidators = [
  body('externalAccessToken').notEmpty().withMessage('Missing externalAccessToken'),
  body('clientId').notEmpty().withMessage('Missing clientId'),
];

export const exchangeHandler = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  return exchangeExternalAuthToken(
    req,
    res,
    req.body.clientId as string,
    req.body.externalAccessToken as string,
    'urn:ietf:params:oauth:token-type:access_token'
  );
};
