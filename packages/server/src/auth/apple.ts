// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import type { JWTVerifyOptions } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { getUserByEmail, tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { isExternalAuth } from './method';
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
  const { idToken, user, clientId, projectId, scope, nonce, createUser } = req.body;

  // Apple client ID must be provided in the request
  // This is the Apple Services ID (e.g., com.example.app)
  if (!clientId) {
    sendOutcome(res, badRequest('Apple client ID not configured'));
    return;
  }

  // Verify the ID token
  const verifyOptions: JWTVerifyOptions = {
    issuer: 'https://appleid.apple.com',
    algorithms: ['RS256'],
    audience: clientId,
  };

  let claims: AppleCredentialClaims;
  try {
    const result = await jwtVerify(idToken, APPLE_JWKS, verifyOptions);
    claims = result.payload as AppleCredentialClaims;
  } catch (err) {
    sendOutcome(res, badRequest((err as Error).message));
    return;
  }

  // Extract user information
  const email = claims.email;
  if (!email) {
    sendOutcome(res, badRequest('Email not provided by Apple'));
    return;
  }

  // Check for external auth redirect
  const externalAuth = await isExternalAuth(email);
  if (externalAuth) {
    res.status(200).json(externalAuth);
    return;
  }

  // Check if user exists, create if needed (following Google auth pattern)
  const existingUser = await getUserByEmail(email, projectId);
  if (!existingUser) {
    if (!createUser) {
      sendOutcome(res, badRequest('User not found'));
      return;
    }
    if (getConfig().registerEnabled === false && (!projectId || projectId === 'new')) {
      sendOutcome(res, badRequest('Registration is disabled'));
      return;
    }

    // Apple provides user info only on first sign-in
    // Extract name information if provided
    const firstName = user?.name?.firstName;
    const lastName = user?.name?.lastName;

    const systemRepo = getSystemRepo();
    await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName,
      lastName,
      email,
      project: projectId && projectId !== 'new' ? { reference: 'Project/' + projectId } : undefined,
    });
  }

  // Try login with Apple credentials using external auth flow
  const login = await tryLogin({
    authMethod: 'external',
    email,
    externalId: claims.sub, // Use Apple's unique user ID
    projectId,
    clientId,
    scope: scope || 'openid offline',
    nonce: nonce || claims.nonce || randomUUID(),
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
    allowNoMembership: createUser || projectId === 'new',
  });

  await sendLoginResult(res, login);
}
