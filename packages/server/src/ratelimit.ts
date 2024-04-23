import { tooManyRequests } from '@medplum/core';
import { Request } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { AuthenticatedRequestContext, getRequestContext } from './context';
import { getRedis } from './redis';

// TODO: These values should be server config settings
// History:
// Before, the default "auth rate limit" was 600 per 15 minutes, but used "MemoryStore" rather than "RedisStore"
// That meant that the rate limit was per server instance, rather than per server cluster
// The value was primarily tuned for one particular cluster with 6 server instances
// Therefore, to maintain parity, the new default "auth rate limit" is 1200 per 15 minutes
const DEFAULT_RATE_LIMIT_PER_15_MINUTES = 15 * 60 * 1000; // 1000 requests per second
const DEFAULT_AUTH_RATE_LIMIT_PER_15_MINUTES = 2400;

let handler: RateLimitRequestHandler | undefined = undefined;
let store: RedisStore | undefined = undefined;

export function getRateLimiter(): RateLimitRequestHandler {
  if (!handler) {
    const client = getRedis();
    store = new RedisStore({
      // See: https://www.npmjs.com/package/rate-limit-redis#:~:text=//%20%40ts%2Dexpect%2Derror%20%2D%20Known%20issue%3A
      // @ts-expect-error - The ioredis call function expects structured string arguments
      sendCommand: (...args: string[]): unknown => client.call(...args),
    });
    handler = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: getRateLimitForRequest,
      validate: true,
      store,
      message: tooManyRequests,
    });
  }
  return handler;
}

export function closeRateLimiter(): void {
  if (handler) {
    store = undefined;
    handler = undefined;
  }
}

async function getRateLimitForRequest(req: Request): Promise<number> {
  // Check if this is an "auth URL" (e.g., /auth/login, /auth/register, /oauth2/token)
  // These URLs have a different rate limit than the rest of the API
  const authUrl = req.originalUrl.startsWith('/auth/') || req.originalUrl.startsWith('/oauth2/');

  let limit = authUrl ? DEFAULT_AUTH_RATE_LIMIT_PER_15_MINUTES : DEFAULT_RATE_LIMIT_PER_15_MINUTES;

  const ctx = getRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    const systemSettingName = authUrl ? 'authRateLimit' : 'rateLimit';
    const systemSetting = ctx.project.systemSetting?.find((s) => s.name === systemSettingName);
    if (systemSetting?.valueInteger) {
      limit = systemSetting.valueInteger;
    }
  }

  return limit;
}
