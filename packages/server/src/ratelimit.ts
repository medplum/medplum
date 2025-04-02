import { OperationOutcomeError, tooManyRequests } from '@medplum/core';
import { Request, Response, Handler } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { AuthenticatedRequestContext, getRequestContext } from './context';
import { getRedis } from './redis';
import { MedplumServerConfig } from './config/types';
import { AuthState } from './oauth/middleware';

// History:
// Before, the default "auth rate limit" was 600 per 15 minutes, but used "MemoryStore" rather than "RedisStore"
// That meant that the rate limit was per server instance, rather than per server cluster
// The value was primarily tuned for one particular cluster with 6 server instances
// Therefore, to maintain parity, the new default "auth rate limit" is 1200 per 15 minutes
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60_000;
const DEFAULT_AUTH_RATE_LIMIT_PER_MINUTE = 160;

export class FhirRateLimiter {
  private readonly limiter: RateLimiterRedis;
  private readonly key: string;

  private currentValue: number;
  private delta: number;
  private limit: number;

  constructor(authState: AuthState, limit: number, currentValue = 0) {
    this.limiter = new RateLimiterRedis({
      keyPrefix: 'medplum:rl:fhir:',
      storeClient: getRedis(),
      points: limit,
      duration: 60, // Per minute
    });
    this.key = this.getKey(authState);

    this.currentValue = currentValue;
    this.delta = 0;
    this.limit = limit;
  }

  /**
   * Retrieve the user's current rate limit consumption
   * @returns The rate limit result
   */
  async get(): Promise<RateLimiterRes> {
    const result = await this.limiter.get(this.key);
    if (!result) {
      throw new Error('Rate limiter not available');
    }

    this.currentValue = result.consumedPoints;
    return result;
  }

  /**
   * Consume rate limit from Redis store
   * @param points - Number of rate limit points to consume
   * @returns Rate limiter result
   */
  async consume(points: number): Promise<RateLimiterRes> {
    // If user is already over the limit, just block
    if (this.currentValue > this.limit) {
      throw new OperationOutcomeError(tooManyRequests);
    }

    this.delta += points;
    try {
      const result = await this.limiter.consume(this.key, points);
      this.currentValue = result.consumedPoints;
      return result;
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw err;
      }
      throw new OperationOutcomeError(tooManyRequests);
    }
  }

  async recordSearch(opts?: { chained: boolean }): Promise<RateLimiterRes> {
    return this.consume(opts?.chained ? 2 : 1);
  }

  async recordWrite(opts?: { transactional: boolean }): Promise<RateLimiterRes> {
    return this.consume(opts?.transactional ? 10 : 5);
  }

  get unitsConsumed(): number {
    return this.delta;
  }

  private getKey(authState: AuthState): string {
    return 'fhir:' + authState.membership.id;
  }
}

let handler: Handler | undefined;
export function rateLimitHandler(config: MedplumServerConfig): Handler {
  if (!handler) {
    if (config.defaultRateLimit === -1) {
      handler = (_req, _res, next) => next(); // Disable rate limiter
    } else {
      handler = async function rateLimitMiddleware(req, res, next) {
        try {
          const result = await getRateLimiter(req, config).consume(getRateLimitKey(req), 1);
          addRateLimitHeader(result, res);
          next();
        } catch (err: unknown) {
          if (err instanceof Error) {
            next(err);
            return;
          }

          const result = err as RateLimiterRes;
          addRateLimitHeader(result, res);
          res.status(429).json(tooManyRequests).end();
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
  res.set('RateLimit', `"default";r=${remainingPoints};t=${Math.ceil(msBeforeNext / 1000)}`);
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
