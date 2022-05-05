import { Request, Response, Router } from 'express';
import { getConfig } from './config';
import { getJwks } from './oauth/keys';

export const wellKnownRouter = Router();

wellKnownRouter.get('/jwks.json', (_req: Request, res: Response) => {
  res.status(200).json(getJwks());
});

wellKnownRouter.get('/openid-configuration', (_req: Request, res: Response) => {
  const config = getConfig();
  res.status(200).json({
    issuer: config.issuer,
    authorization_endpoint: config.authorizeUrl,
    token_endpoint: config.tokenUrl,
    userinfo_endpoint: config.userInfoUrl,
    jwks_uri: config.jwksUrl,
    id_token_signing_alg_values_supported: ['RS256'],
    grant_types_supported: ['client_credentials', 'authorization_code', 'refresh_token'],
    response_types_supported: ['code', 'id_token', 'token id_token'],
    subject_types_supported: ['pairwise', 'public'],
    scopes_supported: ['openid', 'profile', 'email', 'phone', 'address'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    request_object_signing_alg_values_supported: ['none'],
  });
});
