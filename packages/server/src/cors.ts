import cors from 'cors';
import { Request } from 'express';
import { getConfig } from './config';

/**
 * CORS configuration.
 * @param req The express request.
 * @param callback The cors plugin callback.
 */
export const corsOptions: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.header('Origin');
  const allow = isOriginAllowed(origin) && isPathAllowed(req.path);
  if (allow) {
    callback(null, { origin, credentials: true });
  } else {
    callback(null, { origin: false });
  }
};

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  const config = getConfig();
  if (config.appBaseUrl.startsWith(origin) || config.allowedOrigins === '*') {
    return true;
  }

  if (config.allowedOrigins) {
    const whitelist = config.allowedOrigins.split(',');
    return whitelist.some((item) => item.trim() === origin);
  }

  return false;
}

const prefixes = ['/.well-known/', '/admin/', '/auth/', '/fhir/', '/oauth2/'];

function isPathAllowed(path: string): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix));
}
