import { Logger } from '@medplum/core';
import Redis from 'ioredis';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { globalLogger } from './logger';
import { AuthState } from './oauth/middleware';

export class FhirRateLimiter {
  private readonly limiter: RateLimiterRedis;
  private readonly key: string;

  private unitsRemaining: number;
  private secondsToReset = 60;
  private delta: number;
  private logThreshold: number;

  private readonly logger: Logger;

  constructor(redis: Redis, authState: AuthState, limit: number, remainingUnits = limit, logger = globalLogger) {
    this.limiter = new RateLimiterRedis({
      keyPrefix: 'medplum:rl:fhir:',
      storeClient: redis,
      points: limit,
      duration: 60, // Per minute
    });
    this.key = this.getKey(authState);

    this.unitsRemaining = remainingUnits;
    this.delta = 0;

    this.logger = logger;
    this.logThreshold = Math.floor(limit * 0.1); // Log requests that consume at least 10% of the user's total limit
  }

  private setState(result: RateLimiterRes): void {
    this.unitsRemaining = result.remainingPoints;
    this.secondsToReset = Math.ceil(result.msBeforeNext / 1_000);
  }

  rateLimitHeader(): string {
    return `"fhirInteractions";r=${this.unitsRemaining};t=${this.secondsToReset}`;
  }

  /**
   * Consume rate limit from Redis store
   * @param points - Number of rate limit points to consume
   */
  async consume(points: number): Promise<void> {
    // If user is already over the limit, just block
    if (this.unitsRemaining <= 0) {
      // throw new OperationOutcomeError(tooManyRequests);
    }

    this.delta += points;
    try {
      const result = await this.limiter.consume(this.key, points);
      if (this.delta > this.logThreshold) {
        this.logger.warn('High rate limit consumption', {
          limit: this.limiter.points,
          used: result.consumedPoints,
          msToReset: result.msBeforeNext,
        });
        this.logThreshold = Number.POSITIVE_INFINITY; // Disable additional logs for this request
      }
      this.setState(result);
      // return result;
    } catch (err: unknown) {
      if (err instanceof Error) {
        // throw err;
      }
      const result = err as RateLimiterRes;
      this.setState(result);
      this.logger.warn('User rate limited', {
        limit: this.limiter.points,
        used: result.consumedPoints,
        msToReset: result.msBeforeNext,
      });
      // throw new OperationOutcomeError(tooManyRequests);
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

  private getKey(authState: AuthState): string {
    return authState.membership.id;
  }
}
