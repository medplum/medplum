import { badRequest, Operator } from '@medplum/core';
import { ClientApplication, Project, ResourceType, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createRemoteJWKSet, jwtVerify, JWTVerifyOptions } from 'jose';
import { URL } from 'url';
import { getConfig } from '../config';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { getUserByEmail, GoogleCredentialClaims, tryLogin } from '../oauth/utils';
import { isExternalAuth } from './method';
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

  // Resource type can optionally be specified.
  // If specified, only memberships of that type will be returned.
  // If not specified, all memberships will be considered.
  const resourceType = req.body.resourceType as ResourceType | undefined;

  // Project ID can come from one of three sources
  // 1) Passed in explicitly as projectId
  // 2) Implicit with clientId
  // 3) Implicit with googleClientId
  // The only rule is that they have to match
  let projectId = req.body.projectId as string | undefined;

  const googleClientId = req.body.googleClientId;
  if (googleClientId !== getConfig().googleClientId) {
    // If the Google Client ID is not the main Medplum Client ID,
    // then it must be associated with a Project.
    // The user can only authenticate with that project.
    const project = await getProjectByGoogleClientId(googleClientId);
    if (!project) {
      sendOutcome(res, badRequest('Invalid googleClientId'));
      return;
    }

    if (projectId !== undefined && project.id !== projectId) {
      sendOutcome(res, badRequest('Invalid projectId'));
      return;
    }

    projectId = project.id;
  }

  // For OAuth2 flow, check the clientId
  const clientId = req.body.clientId;
  if (clientId) {
    const client = await systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
    const clientProjectId = client.meta?.project as string;
    if (projectId !== undefined && projectId !== clientProjectId) {
      sendOutcome(res, badRequest('Invalid projectId'));
      return;
    }
    projectId = clientProjectId;
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
    remember: true,
    projectId,
    clientId,
    resourceType,
    scope: req.body.scope || 'openid',
    nonce: req.body.nonce || randomUUID(),
    launchId: req.body.launch,
    codeChallenge: req.body.codeChallenge,
    codeChallengeMethod: req.body.codeChallengeMethod,
    remoteAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });
  await sendLoginResult(res, login);
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
