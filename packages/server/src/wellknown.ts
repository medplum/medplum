// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OAuthGrantType, OAuthTokenAuthMethod } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { getConfig } from './config/loader';
import { smartConfigurationHandler, smartStylingHandler } from './fhir/smart';
import { getJwks } from './oauth/keys';

export const wellKnownRouter = Router();

wellKnownRouter.get('/jwks.json', (_req: Request, res: Response) => {
  res.status(200).json(getJwks());
});

function handleOAuthConfig(_req: Request, res: Response): void {
  const config = getConfig();
  res.status(200).json({
    issuer: config.issuer,
    authorization_endpoint: config.authorizeUrl,
    token_endpoint: config.tokenUrl,
    userinfo_endpoint: config.userInfoUrl,
    jwks_uri: config.jwksUrl,
    introspection_endpoint: config.introspectUrl,
    registration_endpoint: config.registerUrl,
    id_token_signing_alg_values_supported: ['RS256'],
    grant_types_supported: [
      OAuthGrantType.ClientCredentials,
      OAuthGrantType.AuthorizationCode,
      OAuthGrantType.RefreshToken,
      OAuthGrantType.TokenExchange,
    ],
    response_types_supported: ['code', 'id_token', 'token id_token'],
    subject_types_supported: ['pairwise', 'public'],
    scopes_supported: ['openid', 'profile', 'email', 'phone', 'address'],
    token_endpoint_auth_methods_supported: [
      OAuthTokenAuthMethod.ClientSecretBasic,
      OAuthTokenAuthMethod.ClientSecretPost,
      OAuthTokenAuthMethod.PrivateKeyJwt,
    ],
    request_object_signing_alg_values_supported: ['none'],
    code_challenge_methods_supported: ['S256', 'plain'],
  });
}

function handleOauthProtectedResource(req: Request, res: Response): void {
  const config = getConfig();
  let resource = config.baseUrl;

  const requestedResource = req.query.resource;
  if (requestedResource) {
    if (typeof requestedResource !== 'string' || !requestedResource.startsWith(config.baseUrl)) {
      res.status(400).send('Invalid resource URL');
      return;
    }
    resource = requestedResource;
  }

  res.status(200).json({
    resource,
    issuer: config.issuer,
    authorization_servers: [config.issuer],
    scopes_supported: ['openid', 'profile', 'email', 'phone', 'address'],
    bearer_methods_supported: ['header'],
    introspection_endpoint: config.introspectUrl,
  });
}

wellKnownRouter.get('/oauth-authorization-server', handleOAuthConfig);
wellKnownRouter.get('/openid-configuration', handleOAuthConfig);
wellKnownRouter.get('/oauth-protected-resource', handleOauthProtectedResource);

// SMART-on-FHIR configuration
// Medplum hosts the SMART well-known both at the root and at the /fhir/R4 paths.
// See: https://build.fhir.org/ig/HL7/smart-app-launch/conformance.html#sample-request
wellKnownRouter.get('/smart-configuration', smartConfigurationHandler);
wellKnownRouter.get('/smart-styles.json', smartStylingHandler);
