import { Request, Response } from 'express';
import { asyncWrap } from '../async';
import { getStandardClientByRedirectUri } from './clients';

/*
 * Handles the OAuth/OpenID Authorization Endpoint.
 * See: https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint
 */

/**
 * HTTP POST handler for /oauth2/register endpoint.
 */
export const registerHandler = asyncWrap(async (req: Request, res: Response) => {
  console.log('CODY DEBUG: handlePostRegister called with body:', req.body);

  //   CODY DEBUG: handlePostRegister called with body: {
  //   mcp_url: 'https://cody.medplum.dev/mcp',
  //   client_name: 'ChatGPT',
  //   redirect_uris: [ 'https://chatgpt.com/connector_platform_oauth_redirect' ],
  //   grant_types: [ 'authorization_code', 'refresh_token' ],
  //   response_types: [ 'code' ],
  //   token_endpoint_auth_method: 'client_secret_basic'
  // }

  const redirectUri = req.body.redirect_uris?.[0];
  if (!redirectUri) {
    console.error('CODY DEBUG: No redirect URI provided in request body');
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Redirect URI is required',
    });
    return;
  }

  const standardClient = getStandardClientByRedirectUri(redirectUri);
  if (!standardClient) {
    console.error('CODY DEBUG: No standard client found for redirect URI:', redirectUri);
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Invalid redirect URI',
    });
    return;
  }

  console.log('CODY DEBUG: Found standard client:', standardClient);

  res.status(201).json({
    client_id: standardClient.id,
    client_secret: standardClient.secret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    // client_secret: 'SUbf2nFWwzNIcRAT1zELMVuQ8pYdNzcN',
  });
});
