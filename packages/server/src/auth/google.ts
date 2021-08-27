import { assertOk, badRequest, Login } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createRemoteJWKSet } from 'jose/jwks/remote';
import { jwtVerify, JWTVerifyOptions } from 'jose/jwt/verify';
import { getConfig } from '../config';
import { MEDPLUM_CLIENT_APPLICATION_ID } from '../constants';
import { invalidRequest, sendOutcome } from '../fhir';
import { finalizeLogin, GoogleCredentialClaims, tryLogin } from '../oauth';

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
export async function googleHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const clientId = getConfig().googleClientId;
  if (!clientId) {
    return sendOutcome(res, badRequest('Google authentication is not enabled'));
  }

  if (req.body.clientId !== clientId) {
    return sendOutcome(res, badRequest('Invalid Google Client ID'));
  }

  const googleJwt = req.body.credential as string;

  const verifyOptions: JWTVerifyOptions = {
    issuer: 'https://accounts.google.com',
    algorithms: ['RS256'],
    audience: clientId
  };

  const result = await jwtVerify(googleJwt, JWKS, verifyOptions);
  const claims = result.payload as GoogleCredentialClaims;
  const [loginOutcome, login] = await tryLogin({
    authMethod: 'google',
    clientId: MEDPLUM_CLIENT_APPLICATION_ID,
    email: claims.email,
    googleCredentials: claims,
    scope: 'openid',
    role: 'practitioner',
    nonce: randomUUID(),
    remember: true
  });
  assertOk(loginOutcome);

  const loginDetails = await finalizeLogin(login as Login);

  return res.status(200).json({
    ...loginDetails.tokens,
    user: loginDetails.user,
    profile: loginDetails.profile
  });
}
