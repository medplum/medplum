import { badRequest, isOk, Login, ProfileResource, Reference, User } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createRemoteJWKSet } from 'jose/jwks/remote';
import { jwtVerify, JWTVerifyOptions } from 'jose/jwt/verify';
import { getConfig } from '../config';
import { MEDPLUM_CLIENT_APPLICATION_ID } from '../constants';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { getAuthTokens, GoogleCredentialClaims, tryLogin } from '../oauth';

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
  console.log('Google claims', JSON.stringify(claims, undefined, 2));

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

  if (!isOk(loginOutcome)) {
    return sendOutcome(res, loginOutcome);
  }

  const [tokenOutcome, token] = await getAuthTokens(login as Login);
  if (!isOk(tokenOutcome)) {
    return sendOutcome(res, tokenOutcome);
  }

  const [userOutcome, user] = await repo.readReference<User>(login?.user as Reference);
  if (!isOk(userOutcome)) {
    return sendOutcome(res, userOutcome);
  }

  const [profileOutcome, profile] = await repo.readReference<ProfileResource>(login?.profile as Reference);
  if (!isOk(profileOutcome)) {
    return sendOutcome(res, profileOutcome);
  }

  if (!profile) {
    return sendOutcome(res, badRequest('Invalid profile'));
  }

  return res.status(200).json({
    ...token,
    user,
    profile
  });
}
