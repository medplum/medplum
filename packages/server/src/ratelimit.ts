import { tooManyRequests } from '@medplum/core';
import { Request } from 'express';
import rateLimit, { MemoryStore, RateLimitRequestHandler } from 'express-rate-limit';
import { AuthenticatedRequestContext, getRequestContext } from './context';

/*
 * MemoryStore must be shutdown to cleanly stop the server.
 */

const DEFAULT_RATE_LIMIT_PER_15_MINUTES = 15 * 60 * 1000; // 1000 requests per second
const DEFAULT_AUTH_RATE_LIMIT_PER_15_MINUTES = 600;

let handler: RateLimitRequestHandler | undefined = undefined;
let store: MemoryStore | undefined = undefined;

export function getRateLimiter(): RateLimitRequestHandler {
  if (!handler) {
    store = new MemoryStore();
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
    store?.shutdown();
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
