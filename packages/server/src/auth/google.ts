import { badRequest, isString, isUUID, Operator } from '@medplum/core';
import { Project, ResourceType, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { createRemoteJWKSet, jwtVerify, JWTVerifyOptions } from 'jose';
import { URL } from 'url';
import { getConfig } from '../config';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { getUserByEmail, GoogleCredentialClaims, tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { isExternalAuth } from './method';
import { getProjectIdByClientId, sendLoginResult } from './utils';

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
export const googleValidator = makeValidationMiddleware([
  body('googleClientId').notEmpty().withMessage('Missing googleClientId'),
  body('googleCredential').notEmpty().withMessage('Missing googleCredential'),
]);

/**
 * Google authentication request handler.
 * This handles POST requests to /auth/google.
 * @param req - The request.
 * @param res - The response.
 */
export async function googleHandler(req: Request, res: Response): Promise<void> {
  // Resource type can optionally be specified.
  // If specified, only memberships of that type will be returned.
  // If not specified, all memberships will be considered.
  const resourceType = req.body.resourceType as ResourceType | undefined;

  // Project ID can come from one of three sources
  // 1) Passed in explicitly as projectId
  // 2) Implicit with clientId
  // 3) Implicit with googleClientId
  // The only rule is that they have to match
  let projectId = validateProjectId(req.body.projectId);
  const clientId = req.body.clientId;
  projectId = await getProjectIdByClientId(clientId, projectId);

  const googleClientId = req.body.googleClientId;
  if (googleClientId !== getConfig().googleClientId) {
    // If the Google Client ID is not the main Medplum Client ID,
    // then it must be associated with a Project.
    // The user can only authenticate with that project.
    const projects = await getProjectsByGoogleClientId(googleClientId, projectId);
    if (projects.length === 0) {
      sendOutcome(res, badRequest('Invalid googleClientId'));
      return;
    }

    if (projects.length === 1) {
      projectId = projects[0].id;
    }
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

  const externalAuth = await isExternalAuth(claims.email);
  if (externalAuth) {
    res.status(200).json(externalAuth);
    return;
  }

  const existingUser = await getUserByEmail(claims.email, projectId);
  if (!existingUser) {
    if (!req.body.createUser) {
      sendOutcome(res, badRequest('User not found'));
      return;
    }
    const systemRepo = getSystemRepo();
    await systemRepo.createResource<User>({
      resourceType: 'User',
      firstName: claims.given_name,
      lastName: claims.family_name,
      email: claims.email,
      project: projectId ? { reference: 'Project/' + projectId } : undefined,
    });
  }

  const login = await tryLogin({
    authMethod: 'google',
    email: claims.email,
    googleCredentials: claims,
    projectId,
    clientId,
    resourceType,
    scope: req.body.scope || 'openid offline',
    nonce: req.body.nonce || randomUUID(),
    launchId: req.body.launch,
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
    allowNoMembership: req.body.createUser,
  });
  await sendLoginResult(res, login);
}

function validateProjectId(inputProjectId: unknown): string | undefined {
  return isString(inputProjectId) && isUUID(inputProjectId) ? inputProjectId : undefined;
}

function getProjectsByGoogleClientId(googleClientId: string, projectId: string | undefined): Promise<Project[]> {
  const filters = [
    {
      code: 'google-client-id',
      operator: Operator.EQUALS,
      value: googleClientId,
    },
  ];

  if (projectId) {
    filters.push({
      code: '_id',
      operator: Operator.EQUALS,
      value: projectId,
    });
  }

  const systemRepo = getSystemRepo();
  return systemRepo.searchResources<Project>({ resourceType: 'Project', filters });
}
