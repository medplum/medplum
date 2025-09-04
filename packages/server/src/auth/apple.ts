// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { createRemoteJWKSet, jwtVerify, JWTVerifyOptions } from 'jose';
import { makeValidationMiddleware } from '../util/validator';
import { tryLogin } from '../oauth/utils';
import { sendLoginResult } from './utils';

/*
 * Integrating Apple Sign-In into your app
 * https://developer.apple.com/sign-in-with-apple/
 */

/**
 * Apple JSON Web Key Set.
 * These are public certs that are used to verify Apple JWTs.
 */
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Apple authentication validators.
 * A request to the /auth/apple endpoint is expected to satisfy these validators.
 * These values are obtained from the Apple Sign-in button.
 */
export const appleValidator = makeValidationMiddleware([
  body('idToken').notEmpty().withMessage('Missing ID token'),
  body('user').optional().isObject().withMessage('Invalid user object'),
]);

/**
 * Interface for Apple ID token claims.
 * Based on Apple's JWT token structure.
 */
export interface AppleCredentialClaims {
  iss: string; // Issuer (https://appleid.apple.com)
  aud: string; // Audience (your app's client ID)
  exp: number; // Expiration time
  iat: number; // Issued at time
  sub: string; // Subject (unique user identifier)
  email?: string; // User's email
  email_verified?: boolean; // Email verification status
  is_private_email?: boolean; // Whether using Apple's private relay
  real_user_status?: number; // User detection status
  nonce?: string; // Nonce for replay attack prevention
  nonce_supported?: boolean; // Whether nonce is supported
}

/**
 * Interface for Apple user information.
 * This is only provided on first sign-in.
 */
export interface AppleUserInfo {
  name?: {
    firstName?: string;
    lastName?: string;
  };
  email?: string;
}

/**
 * Apple authentication request handler.
 * This handles POST requests to /auth/apple.
 * @param req - The request.
 * @param res - The response.
 */
export async function appleHandler(req: Request, res: Response): Promise<void> {
  const { idToken, user, clientId, projectId, scope, nonce } = req.body;

  // Get client ID from request or environment
  const appleClientId = clientId || process.env.APPLE_CLIENT_ID;
  if (!appleClientId) {
    throw new OperationOutcomeError(badRequest('Apple client ID not configured'));
  }

  // Verify the ID token
  const verifyOptions: JWTVerifyOptions = {
    issuer: 'https://appleid.apple.com',
    audience: appleClientId,
    algorithms: ['RS256'],
  };

  let claims: AppleCredentialClaims;
  try {
    const result = await jwtVerify(idToken, APPLE_JWKS, verifyOptions);
    claims = result.payload as AppleCredentialClaims;
  } catch (_err) {
    throw new OperationOutcomeError(badRequest('Invalid Apple ID token'));
  }

  // Extract user information
  const email = claims.email;
  if (!email) {
    throw new OperationOutcomeError(badRequest('Email not provided by Apple'));
  }

  // Apple provides user info only on first sign-in
  // Store name information if provided
  let firstName: string | undefined;
  let lastName: string | undefined;
  if (user?.name) {
    firstName = user.name.firstName;
    lastName = user.name.lastName;
  }

  // Try login with Apple credentials using existing external auth flow
  const login = await tryLogin({
    authMethod: 'external',
    email,
    externalId: claims.sub, // Use Apple's unique user ID
    projectId,
    clientId: appleClientId,
    scope: scope || 'openid offline',
    nonce: nonce || claims.nonce,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
    // Store first-time user info if available
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
  });

  await sendLoginResult(res, login);
}