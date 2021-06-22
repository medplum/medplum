import { Request, Response, Router } from 'express';
import { getConfig } from './config';
import { getJwks } from './oauth/keys';

export const wellKnownRouter = Router();

wellKnownRouter.get('/jwks.json', (req: Request, res: Response) => {
  res.status(200).json(getJwks());
});

wellKnownRouter.get('/openid-configuration', (req: Request, res: Response) => {
  const config = getConfig();
  res.status(200).json({
    issuer: config.issuer,
    authorization_endpoint: config.authorizeUrl,
    token_endpoint: config.tokenUrl,
    userinfo_endpoint: config.userInfoUrl,
    jwks_uri: config.jwksUrl,
    id_token_signing_alg_values_supported: [
      'RS256'
    ],
    response_types_supported: [
      'code',
      'id_token',
      'token id_token',
    ],
    subject_types_supported: [
      'pairwise',
      'public'
    ]
  });
});
