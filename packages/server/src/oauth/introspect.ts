import { RequestHandler, Request, Response } from 'express';
import { asyncWrap } from '../async';
import { verifyJwt } from './keys';

/**
 * Handles the OAuth2 Token Introspection Endpoint
 * See: https://www.rfc-editor.org/rfc/rfc7662.html
 */
export const userInfoHandler: RequestHandler = asyncWrap(async (req: Request, res: Response) => {
  const token = req.body.token;
  if (!token) {
    res.status(400).end('Token to introspect must be provided');
    return;
  }

  try {
    const decodedToken = await verifyJwt(token);
    const { exp, iat, sub } = decodedToken.payload;

    res.status(200).end({ active: true, iat, exp, sub });
  } catch (_) {
    res.status(200).end({ active: false });
    return;
  }
});
