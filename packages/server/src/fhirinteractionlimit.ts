import { Logger, OperationOutcomeError, tooManyRequests } from '@medplum/core';
import { Response } from 'express';
import Redis from 'ioredis';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { AuthState } from './oauth/middleware';

export class FhirRateLimiter {
  private readonly limiter: RateLimiterRedis;
  private readonly userKey: string;
  private readonly projectLimiter: RateLimiterRedis;
  private readonly projectKey: string;

  private current?: RateLimiterRes;
  private delta: number;
  private logThreshold: number;
  private readonly enabled: boolean;

  private readonly logger: Logger;

  constructor(redis: Redis, authState: AuthState, userLimit: number, projectLimit: number, logger: Logger) {
    this.limiter = new RateLimiterRedis({
      keyPrefix: 'medplum:rl:fhir:membership:',
      storeClient: redis,
      points: userLimit,
      duration: 60, // Per minute
    });
    this.userKey = authState.membership.id;

    this.projectLimiter = new RateLimiterRedis({
      keyPrefix: 'medplum:rl:fhir:project:',
      storeClient: redis,
      points: projectLimit,
      duration: 60, // Per minute
    });
    this.projectKey = authState.project.id;

    this.delta = 0;

    this.logger = logger;
    this.logThreshold = Math.floor(userLimit * 0.1); // Log requests that consume at least 10% of the user's total limit
    this.enabled = Boolean(authState.project.systemSetting?.find((s) => s.name === 'enableFhirQuota')?.valueBoolean);
  }

  private setState(result: RateLimiterRes, ...others: RateLimiterRes[]): void {
    let min = result.remainingPoints;
    for (const other of others) {
      if (other.remainingPoints < min) {
        min = other.remainingPoints;
        result = other;
      }
    }
    this.current = result;
  }

  attachRateLimitHeader(res: Response): void {
    if (this.current) {
      const t = Math.ceil(this.current.msBeforeNext / 1000);
      res.append('RateLimit', `"fhirInteractions";r=${this.current.remainingPoints};t=${t}`);
    }
  }

  /**
   * Consume rate limit from Redis store
   * @param points - Number of rate limit points to consume
   */
  async consume(points: number): Promise<void> {
    // If user is already over the limit, just block
    if (this.current && this.current.remainingPoints <= 0 && this.enabled) {
      throw new OperationOutcomeError(tooManyRequests);
    }

    this.delta += points;
    try {
      const result = await this.limiter.consume(this.userKey, points);
      if (this.delta > this.logThreshold) {
        this.logger.warn('High rate limit consumption', {
          limit: this.limiter.points,
          used: result.consumedPoints,
          msToReset: result.msBeforeNext,
        });
        this.logThreshold = Number.POSITIVE_INFINITY; // Disable additional logs for this request
      }
      const projectResult = await this.projectLimiter.consume(this.projectKey, points);
      this.setState(result, projectResult);
    } catch (err: unknown) {
      if (err instanceof Error && this.enabled) {
        throw err;
      }
      const result = err as RateLimiterRes;
      this.setState(result);
      this.logger.warn('User rate limited', {
        limit: this.limiter.points,
        used: result.consumedPoints,
        msToReset: result.msBeforeNext,
      });
      if (this.enabled) {
        throw new OperationOutcomeError(tooManyRequests);
      }
    }
  }

  async recordRead(num = 1): Promise<void> {
    return this.consume(Math.max(num, 1));
  }

  async recordHistory(): Promise<void> {
    return this.consume(10);
  }

  async recordSearch(): Promise<void> {
    return this.consume(100);
  }

  async recordWrite(): Promise<void> {
    return this.consume(100);
  }

  get unitsConsumed(): number {
    return this.delta;
  }
}
