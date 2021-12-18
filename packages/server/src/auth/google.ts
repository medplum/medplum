import { assertOk, badRequest } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createRemoteJWKSet, jwtVerify, JWTVerifyOptions } from 'jose';
import { getConfig } from '../config';
import { invalidRequest, sendOutcome } from '../fhir';
import { GoogleCredentialClaims, tryLogin } from '../oauth';
import { sendLoginResult } from './utils';

/*
 * Integrating Google Sign-In into your web app
 * https://developers.google.com/identity/sign-in/web/sign-in
 */

/**
 * Google JSON Web Key Set.
 * These are public certs that are used to verify Google JWTs.
 */
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Google authentication validators.
 * A request to the /auth/google endpoint is expected to satisfy these validators.
 * These values are obtained from the Google Sign-in button.
 */
export const googleValidators = [
  body('clientId').notEmpty().withMessage('Missing clientId'),
  body('credential').notEmpty().withMessage('Missing credential'),
];

/**
 * Google authentication request handler.
 * This handles POST requests to /auth/google.
 * @param req The request.
 * @param res The response.
 */
export async function googleHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const clientId = getConfig().googleClientId;
  if (!clientId) {
    sendOutcome(res, badRequest('Google authentication is not enabled'));
    return;
  }

  if (req.body.clientId !== clientId) {
    sendOutcome(res, badRequest('Invalid Google Client ID'));
    return;
  }

  const googleJwt = req.body.credential as string;

  const verifyOptions: JWTVerifyOptions = {
    issuer: 'https://accounts.google.com',
    algorithms: ['RS256'],
    audience: clientId,
  };

  const result = await jwtVerify(googleJwt, JWKS, verifyOptions);
  const claims = result.payload as GoogleCredentialClaims;
  const [loginOutcome, login] = await tryLogin({
    authMethod: 'google',
    email: claims.email,
    googleCredentials: claims,
    scope: 'openid',
    nonce: randomUUID(),
    remember: true,
  });
  assertOk(loginOutcome);
  await sendLoginResult(res, login as Login);
}
