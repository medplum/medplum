import { badRequest, createReference, Operator } from '@medplum/core';
import { Project, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createRemoteJWKSet, jwtVerify, JWTVerifyOptions } from 'jose';
import { URL } from 'url';
import { getConfig } from '../config';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { getUserByEmail, GoogleCredentialClaims, tryLogin } from '../oauth';
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
  body('googleClientId').notEmpty().withMessage('Missing googleClientId'),
  body('googleCredential').notEmpty().withMessage('Missing googleCredential'),
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

  const googleClientId = req.body.googleClientId;
  let project: Project | undefined;

  if (googleClientId !== getConfig().googleClientId) {
    // If the Google Client ID is not the main Medplum Client ID,
    // then it must be associated with a Project.
    // The user can only authenticate with that project.
    project = await getProjectByGoogleClientId(googleClientId);
    if (!project) {
      sendOutcome(res, badRequest('Invalid googleClientId'));
      return;
    }
  }

  if (req.body.projectId && project && req.body.projectId !== project.id) {
    sendOutcome(res, badRequest('Invalid projectId'));
    return;
  }

  const googleJwt = req.body.googleCredential as string;

  const verifyOptions: JWTVerifyOptions = {
    issuer: 'https://accounts.google.com',
    algorithms: ['RS256'],
    audience: googleClientId,
  };

  let result;
  try {
    result = await jwtVerify(googleJwt, JWKS, verifyOptions);
  } catch (err) {
    sendOutcome(res, badRequest((err as Error).message));
    return;
  }

  const claims = result.payload as GoogleCredentialClaims;

  const existingUser = await getUserByEmail(claims.email, project?.id);
  if (!existingUser) {
    if (!req.body.createUser) {
      sendOutcome(res, badRequest('User not found'));
      return;
    }
    await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: claims.given_name,
      lastName: claims.family_name,
      email: claims.email,
      project: project ? createReference(project) : undefined,
    });
  }

  const login = await tryLogin({
    authMethod: 'google',
    email: claims.email,
    googleCredentials: claims,
    remember: true,
    projectId: req.body.projectId || project?.id,
    clientId: req.body.clientId || undefined,
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
  await sendLoginResult(res, login, req.body.projectId === 'new');
}

async function getProjectByGoogleClientId(googleClientId: string): Promise<Project | undefined> {
  const bundle = await systemRepo.search<Project>({
    resourceType: 'Project',
    count: 1,
    filters: [
      {
        code: 'google-client-id',
        operator: Operator.EQUALS,
        value: googleClientId,
      },
    ],
  });
  return bundle.entry && bundle.entry.length > 0 ? bundle.entry[0].resource : undefined;
}
