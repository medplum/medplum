import { tooManyRequests } from '@medplum/core';
import { Request } from 'express';
import rateLimit, { MemoryStore, RateLimitRequestHandler } from 'express-rate-limit';
import { AuthenticatedRequestContext, getRequestContext } from './context';

/*
 * MemoryStore must be shutdown to cleanly stop the server.
 */

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
  const authUrl = req.originalUrl.startsWith('/auth/') || req.originalUrl.startsWith('/oauth2/');

  // TODO: Update this logic to use Project.systemSetting instead of features

  let enterprise = false;
  const ctx = getRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    enterprise = !!ctx.project.features?.includes('bots');
  }

  if (enterprise) {
    return authUrl ? 600 : 10000;
  } else {
    return authUrl ? 600 : 10000;
  }
}
