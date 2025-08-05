// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, tooManyRequests } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Handler, Request, Response } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { MedplumServerConfig } from './config/types';
import { AuthenticatedRequestContext, getRequestContext } from './context';
import { getRedis } from './redis';

// History:
// Before, the default "auth rate limit" was 600 per 15 minutes, but used "MemoryStore" rather than "RedisStore"
// That meant that the rate limit was per server instance, rather than per server cluster
// The value was primarily tuned for one particular cluster with 6 server instances
// Therefore, to maintain parity, the new default "auth rate limit" is 1200 per 15 minutes
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60_000;
const DEFAULT_AUTH_RATE_LIMIT_PER_MINUTE = 160;

let handler: Handler | undefined;
export function rateLimitHandler(config: MedplumServerConfig): Handler {
  if (!handler) {
    if (config.defaultRateLimit === -1) {
      handler = (_req, _res, next) => next(); // Disable rate limiter
    } else {
      handler = async function rateLimiter(req, res, next) {
        const limit = getRateLimiter(req, config);
        try {
          const result = await limit.consume(getRateLimitKey(req), 1);
          addRateLimitHeader(result, res);
          next();
        } catch (err: unknown) {
          if (err instanceof Error) {
            next(err);
            return;
          }

          const result = err as RateLimiterRes;
          addRateLimitHeader(result, res);

          const outcome: OperationOutcome = deepClone(tooManyRequests);
          outcome.issue[0].diagnostics = JSON.stringify({ ...result, limit: limit.points });
          res.status(429).json(outcome).end();
        }
      };
    }
  }
  return handler;
}

export function getRateLimiter(req: Request, config?: MedplumServerConfig): RateLimiterRedis {
  const client = getRedis();
  return new RateLimiterRedis({
    keyPrefix: 'medplum:rl:',
    storeClient: client,
    points: getRateLimitForRequest(req, config), // Number of points
    duration: 60, // Per minute
  });
}

function getRateLimitKey(req: Request): string {
  return (req.ip as string) + (isAuthRequest(req) ? ':auth' : '');
}

function addRateLimitHeader(result: RateLimiterRes, res: Response): void {
  const { remainingPoints, msBeforeNext } = result;
  res.append('RateLimit', `"requests";r=${remainingPoints};t=${Math.ceil(msBeforeNext / 1000)}`);
}

export function closeRateLimiter(): void {
  handler = undefined;
}

function isAuthRequest(req: Request): boolean {
  // Check if this is an "auth URL" (e.g., /auth/login, /auth/register, /oauth2/token)
  // These URLs have a different rate limit than the rest of the API
  if (req.originalUrl === '/auth/me') {
    return false; // Read-only URL doesn't need the same rate limit protection
  }
  return req.originalUrl.startsWith('/auth/') || req.originalUrl.startsWith('/oauth2/');
}

function getRateLimitForRequest(req: Request, config?: MedplumServerConfig): number {
  const isAuthUrl = isAuthRequest(req);
  let limit: number;
  if (isAuthUrl) {
    limit = config?.defaultAuthRateLimit ?? DEFAULT_AUTH_RATE_LIMIT_PER_MINUTE;
  } else {
    limit = config?.defaultRateLimit ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
  }

  const ctx = getRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    const systemSettingName = isAuthUrl ? 'authRateLimit' : 'rateLimit';
    const systemSetting = ctx.project.systemSetting?.find((s) => s.name === systemSettingName);
    if (systemSetting?.valueInteger) {
      limit = systemSetting.valueInteger;
    }
  }

  return limit;
}
