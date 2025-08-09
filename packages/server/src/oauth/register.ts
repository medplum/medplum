// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Request, Response } from 'express';
import { asyncWrap } from '../async';
import { getClientRedirectUris, getStandardClientByRedirectUri } from './clients';

/*
 * OAuth 2.0 Dynamic Client Registration Protocol
 * See: https://datatracker.ietf.org/doc/html/rfc7591
 */

/**
 * HTTP POST handler for /oauth2/register endpoint.
 */
export const registerHandler = asyncWrap(async (req: Request, res: Response) => {
  const redirectUri = req.body.redirect_uris?.[0];
  if (!redirectUri) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Redirect URI is required',
    });
    return;
  }

  const standardClient = getStandardClientByRedirectUri(redirectUri);
  if (!standardClient) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Invalid redirect URI',
    });
    return;
  }

  res.status(201).json({
    client_id: standardClient.id,
    client_secret: standardClient.secret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: getClientRedirectUris(standardClient),
  });
});
