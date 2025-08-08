// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Login, SmartAppLaunch } from '@medplum/fhirtypes';
import { Request, RequestHandler, Response } from 'express';
import { JWTPayload } from 'jose';
import { asyncWrap } from '../async';
import { getSystemRepo } from '../fhir/repo';
import { verifyJwt } from './keys';

/**
 * Handles the OAuth2 Token Introspection Endpoint
 * See: https://www.rfc-editor.org/rfc/rfc7662.html
 */
export const tokenIntrospectHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  const systemRepo = getSystemRepo();
  const token = req.body.token;
  if (!token) {
    res.status(400).end('Token to introspect must be provided');
    return;
  }

  try {
    const decodedToken = await verifyJwt(token);

    const login = await systemRepo.readResource<Login>('Login', decodedToken.payload.login_id as string);
    if (!login.granted || login.revoked) {
      writeInactiveResponse(res);
      return;
    }

    let launch: SmartAppLaunch | undefined;
    if (login.launch) {
      launch = await systemRepo.readReference(login.launch);
    }

    writeActiveResponse(res, decodedToken.payload, login, launch);
  } catch (_) {
    writeInactiveResponse(res);
  }
});

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
