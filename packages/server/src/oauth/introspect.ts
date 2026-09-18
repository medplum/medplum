// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolveId } from '@medplum/core';
import type { Login, ProjectMembership, SmartAppLaunch } from '@medplum/fhirtypes';
import type { Request, RequestHandler, Response } from 'express';
import type { JWTPayload } from 'jose';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo } from '../fhir/repo';
import { getProjectScopedUrl } from '../util/url';
import type { MedplumBaseClaims } from './keys';
import { verifyJwt } from './keys';
import { timingSafeEqualStr } from './utils';

/**
 * Handles the OAuth2 Token Introspection Endpoint
 * See: https://www.rfc-editor.org/rfc/rfc7662.html
 * @param req - The request object
 * @param res - The response object
 */
export const tokenIntrospectHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  const token = req.body.token;
  if (!token) {
    res.status(400).end('Token to introspect must be provided');
    return;
  }

  try {
    const expectedIssuer = getProjectScopedUrl(req.originalUrl, getConfig().issuer);
    const decodedToken = await verifyJwt(token, expectedIssuer);
    const claims = decodedToken.payload as MedplumBaseClaims & { refresh_secret?: string };

    // Introspection is defined only for access and refresh tokens, which are audienced to the issuer.
    // ID tokens are audienced to the client, and are not introspectable here.
    if (claims.aud !== expectedIssuer) {
      writeInactiveResponse(res);
      return;
    }

    const systemRepo = getGlobalSystemRepo();
    const login = await systemRepo.readResource<Login>('Login', claims.login_id);
    if (!login.granted || login.revoked) {
      writeInactiveResponse(res);
      return;
    }

    if (!(await canIntrospectToken(systemRepo, login, claims))) {
      writeInactiveResponse(res);
      return;
    }

    // Ensure that only the current refresh token is marked as active, since the
    // JWT itself may not be expired
    if (claims.refresh_secret !== undefined && !timingSafeEqualStr(login.refreshSecret, claims.refresh_secret)) {
      writeInactiveResponse(res);
      return;
    }

    let launch: SmartAppLaunch | undefined;
    if (login.launch) {
      launch = await systemRepo.readReference(login.launch);
    }

    writeActiveResponse(res, decodedToken.payload, login, launch);
  } catch {
    writeInactiveResponse(res);
  }
};

/**
 * Determines whether the authenticated caller is entitled to introspect the given token.
 * @param systemRepo - The system repository.
 * @param login - The login referenced by the introspected token.
 * @param claims - The claims of the introspected token.
 * @returns True if the caller may see the token's details; false otherwise.
 */
async function canIntrospectToken(
  systemRepo: SystemRepository,
  login: Login,
  claims: MedplumBaseClaims
): Promise<boolean> {
  const ctx = getAuthenticatedContext();
  if (ctx.project.superAdmin) {
    return true;
  }

  // The token must belong to the caller's project. `Login.project` is absent on
  // `client_credentials` logins, which record the project only on the membership.
  let loginProjectId = resolveId(login.project);
  if (!loginProjectId && login.membership) {
    const membership = await systemRepo.readReference<ProjectMembership>(login.membership);
    loginProjectId = resolveId(membership.project);
  }
  if (!loginProjectId || loginProjectId !== ctx.project.id) {
    return false;
  }

  // The token must have been issued to the client making the request. Bearer callers record the
  // client on the login, while Basic auth has no login step, so `getLoginForBasicAuth` synthesizes
  // a login without a client and supplies the ClientApplication as the profile instead.
  const { login: callerLogin, profile } = ctx.authState;
  const callerClientId =
    resolveId(callerLogin.client) ?? (profile?.resourceType === 'ClientApplication' ? profile.id : undefined);
  return claims.client_id === callerClientId;
}

function writeInactiveResponse(res: Response): void {
  res.status(200).json({ active: false }).end();
}

const patientPrefix = 'Patient/';
function writeActiveResponse(res: Response, payload: JWTPayload, login: Login, launch?: SmartAppLaunch): void {
  const { exp, iat, iss, sub, client_id, scope, profile } = payload;
  let patient = launch?.patient?.reference?.substring(patientPrefix.length);
  if (!patient && typeof profile === 'string' && profile.startsWith(patientPrefix)) {
    patient = profile.substring(patientPrefix.length);
  }
  res.status(200).json({ active: true, iat, exp, iss, sub, client_id, scope, patient }).end();
}
