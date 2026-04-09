// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, LRUCache, tooManyRequests } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { Handler, Request, Response } from 'express';
import type { RateLimiterRes } from 'rate-limiter-flexible';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import type { MedplumServerConfig } from './config/types';
import { AuthenticatedRequestContext, getRequestContext } from './context';
import { getRateLimitRedis } from './redis';

// There are three separate rate limits:
// 1. "Login" rate limit - applies only to `/auth/login` and `/auth/register` endpoints
// 2. "Auth" rate limit - applies to all other `/auth/*` and `/oauth2/*` endpoints (e.g., `/auth/me`, `/oauth2/token`)
// 3. Default rate limit - applies to all other API endpoints (e.g., `/fhir/R4/Patient`)

// History:
// Before, the default "auth rate limit" was 600 per 15 minutes, but used "MemoryStore" rather than "RedisStore"
// That meant that the rate limit was per server instance, rather than per server cluster
// The value was primarily tuned for one particular cluster with 6 server instances
// Therefore, to maintain parity, the new default "auth rate limit" is 1200 per 15 minutes

interface RateLimitCategoryConfig {
  readonly name: string;
  readonly serverConfigKey: keyof MedplumServerConfig;
  readonly systemSettingName: string;
  readonly defaultLimitPerMinute: number;
  readonly matchesUrl: (url: string) => boolean;
}

const categories: RateLimitCategoryConfig[] = [
  {
    name: 'login',
    serverConfigKey: 'defaultLoginRateLimit',
    systemSettingName: 'loginRateLimit',
    defaultLimitPerMinute: 5,
    matchesUrl: (url: string) => url === '/auth/login' || url === '/auth/newuser' || url === '/auth/newproject',
  },
  {
    name: 'auth',
    serverConfigKey: 'defaultAuthRateLimit',
    systemSettingName: 'authRateLimit',
    defaultLimitPerMinute: 1200,
    matchesUrl: (url: string) => (url.startsWith('/auth/') || url.startsWith('/oauth2/')) && url !== '/auth/me',
  },
  {
    name: 'default',
    serverConfigKey: 'defaultRateLimit',
    systemSettingName: 'rateLimit',
    defaultLimitPerMinute: 60_000,
    matchesUrl: (_url: string) => true, // Applies to all other paths
  },
];

type InMemoryBlock = {
  result: RateLimiterRes;
  resetTimestamp: number;
};
const blockedUsers = new LRUCache<InMemoryBlock>(1000);

let handler: Handler | undefined;
export function rateLimitHandler(config: MedplumServerConfig): Handler {
  if (!handler) {
    if (config.defaultRateLimit === -1) {
      handler = (_req, _res, next) => next(); // Disable rate limiter
    } else {
      handler = async function rateLimiter(req, res, next) {
        const key = getRateLimitKey(req);
        const limit = getRateLimiter(req, config);

        const userBlock = blockedUsers.get(key);
        if (userBlock) {
          if (Date.now() <= userBlock.resetTimestamp) {
            blockRequest(res, userBlock.result, limit);
            return;
          }
          // User block has expired, request can proceed
          blockedUsers.delete(key);
        }

        try {
          const result = await limit.consume(key, 1);
          addRateLimitHeader(result, res);
          next();
        } catch (err: unknown) {
          if (err instanceof Error) {
            next(err);
            return;
          }
          blockRequest(res, err as RateLimiterRes, limit);
        }
      };
    }
  }
  return handler;
}

function blockRequest(res: Response, result: RateLimiterRes, limiter: RateLimiterRedis): void {
  addRateLimitHeader(result, res);
  const outcome: OperationOutcome = deepClone(tooManyRequests);
  outcome.issue[0].diagnostics = JSON.stringify({ ...result, limit: limiter.points });
  res.status(429).json(outcome).end();
}

export function getRateLimiter(req: Request, config?: MedplumServerConfig): RateLimiterRedis {
  const client = getRateLimitRedis();
  return new RateLimiterRedis({
    keyPrefix: 'medplum:rl:',
    storeClient: client,
    points: getRateLimitForRequest(req, config), // Number of points
    duration: 60, // Per minute
  });
}

function getRateLimitKey(req: Request): string {
  const category = getRateLimitCategory(req);
  const categoryKey = category.name;
  return (req.ip as string) + (categoryKey === 'default' ? '' : `:${categoryKey}`);
}

function addRateLimitHeader(result: RateLimiterRes, res: Response): void {
  const { remainingPoints, msBeforeNext } = result;
  res.append('RateLimit', `"requests";r=${remainingPoints};t=${Math.ceil(msBeforeNext / 1000)}`);
}

export function closeRateLimiter(): void {
  handler = undefined;
}

function getRateLimitForRequest(req: Request, config?: MedplumServerConfig): number {
  const category = getRateLimitCategory(req);
  let limit: number = category.defaultLimitPerMinute;

  const serverConfigKey = category.serverConfigKey;
  if (config && typeof config[serverConfigKey] === 'number') {
    limit = config[serverConfigKey];
  }

  const ctx = getRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    const systemSettingName = category.systemSettingName;
    const systemSetting = ctx.project.systemSetting?.find((s) => s.name === systemSettingName);
    if (systemSetting?.valueInteger) {
      limit = systemSetting.valueInteger;
    }
  }

  return limit;
}

function getRateLimitCategory(req: Request): RateLimitCategoryConfig {
  const url = req.originalUrl;
  for (const category of categories) {
    if (category.matchesUrl(url)) {
      return category;
    }
  }
  return categories[categories.length - 1]; // Default category is the last one in the list
}
