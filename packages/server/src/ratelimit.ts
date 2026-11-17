// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, LRUCache, setRateLimitReset, tooManyRequests } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { Handler, Request, Response } from 'express';
import type { RateLimiterRes } from 'rate-limiter-flexible';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import type { ServerConfig } from './config/utils';
import { AuthenticatedRequestContext, getRequestContext } from './context';
import { getRateLimitRedis } from './redis';
import { getNormalizedPath } from './util/url';

// There are four separate rate limits:
// 1. "Login" rate limit - applies only to `/auth/login` and `/auth/register` endpoints
// 2. "MFA" rate limit - applies to unauthenticated MFA verification endpoints
// 3. "Auth" rate limit - applies to all other `/auth/*` and `/oauth2/*` endpoints (e.g., `/auth/me`, `/oauth2/token`)
// 4. Default rate limit - applies to all other API endpoints (e.g., `/fhir/R4/Patient`)

// History:
// Before, the default "auth rate limit" was 600 per 15 minutes, but used "MemoryStore" rather than "RedisStore"
// That meant that the rate limit was per server instance, rather than per server cluster
// The value was primarily tuned for one particular cluster with 6 server instances
// Therefore, to maintain parity, the new default "auth rate limit" is 1200 per 15 minutes

interface RateLimitCategoryConfig {
  readonly name: string;
  readonly serverConfigKey: keyof ServerConfig;
  readonly systemSettingName: string;
  readonly defaultLimitPerMinute: number;
  // Request paths are lowercased before matching, so these must be lowercase (enforced in ratelimit.test.ts)
  readonly paths?: readonly string[];
  readonly prefixes?: readonly string[];
  readonly excludedPaths?: readonly string[];
}

export const categories: RateLimitCategoryConfig[] = [
  {
    name: 'login',
    serverConfigKey: 'defaultLoginRateLimit',
    systemSettingName: 'loginRateLimit',
    defaultLimitPerMinute: 5,
    paths: ['/auth/login', '/auth/newuser', '/auth/newproject'],
  },
  {
    name: 'mfa',
    serverConfigKey: 'defaultMfaRateLimit',
    systemSettingName: 'mfaRateLimit',
    defaultLimitPerMinute: 10,
    paths: ['/auth/mfa/verify', '/auth/mfa/login-enroll'],
  },
  {
    name: 'auth',
    serverConfigKey: 'defaultAuthRateLimit',
    systemSettingName: 'authRateLimit',
    defaultLimitPerMinute: 600,
    prefixes: ['/auth/', '/oauth2/'],
    excludedPaths: ['/auth/me'],
  },
  {
    name: 'default',
    serverConfigKey: 'defaultRateLimit',
    systemSettingName: 'rateLimit',
    defaultLimitPerMinute: 60_000, // Applies to all other paths
  },
];

type InMemoryBlock = {
  result: RateLimiterRes;
  resetTimestamp: number;
};
const blockedUsers = new LRUCache<InMemoryBlock>(1000);

let handler: Handler | undefined;
export function rateLimitHandler(config: ServerConfig): Handler {
  if (!handler) {
    if (!config.rateLimitsEnabled || config.defaultRateLimit === -1) {
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
  setRateLimitReset(outcome, result.msBeforeNext);
  res.status(429).json(outcome).end();
}

export function getRateLimiter(req: Request, config?: ServerConfig): RateLimiterRedis {
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

function getRateLimitForRequest(req: Request, config?: ServerConfig): number {
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
  // Express routing is case-insensitive and ignores one trailing slash
  let url = getNormalizedPath(req.originalUrl.toLowerCase());
  if (url.length > 1 && url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  for (let i = 0; i < categories.length - 1; i++) {
    const category = categories[i];
    if (
      !category.excludedPaths?.includes(url) &&
      (category.paths?.includes(url) || category.prefixes?.some((prefix) => url.startsWith(prefix)))
    ) {
      return category;
    }
  }
  return categories[categories.length - 1]; // Default category is the last one in the list
}
