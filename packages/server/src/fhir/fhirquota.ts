// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, Logger, OperationOutcomeError, sleep, tooManyRequests } from '@medplum/core';
import { Response } from 'express';
import Redis from 'ioredis';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { AuthState } from '../oauth/middleware';

export class FhirRateLimiter {
  private readonly limiter: RateLimiterRedis;
  private readonly userKey: string;
  private readonly projectLimiter: RateLimiterRedis;
  private readonly projectKey: string;

  private current?: RateLimiterRes;
  private delta: number;
  private logThreshold: number;
  private readonly enabled: boolean;
  private readonly async: boolean;

  private readonly logger: Logger;

  constructor(
    redis: Redis,
    authState: AuthState,
    userLimit: number,
    projectLimit: number,
    logger: Logger,
    async?: boolean
  ) {
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
    this.enabled = authState.project.systemSetting?.find((s) => s.name === 'enableFhirQuota')?.valueBoolean !== false;
    this.async = async ?? false;
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
    if (this.current && this.current.remainingPoints <= 0) {
      await this.block(points, this.current);
      return;
    }
    await this.consumeImpl(points);
  }

  private async consumeImpl(points: number): Promise<void> {
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
      if (err instanceof Error) {
        this.logger.error('Error updating FHIR quota', err);

        if (!this.enabled) {
          return;
        }
        throw err;
      } else if (!(err instanceof RateLimiterRes)) {
        this.logger.error('Unhandled rate limiter response', { response: JSON.stringify(err) });
        return;
      }
      const result = err as RateLimiterRes;
      this.setState(result);
      this.logger.warn('User rate limited', {
        limit: this.limiter.points,
        used: result.consumedPoints,
        msToReset: result.msBeforeNext,
        enabled: this.enabled,
      });
      await this.block(points, result);
    }
  }

  async block(points: number, result: RateLimiterRes): Promise<void> {
    if (this.enabled) {
      if (this.async) {
        // Sleep until quota resets, plus up to 25% jitter to prevent simultaneous retries
        const waitMs = Math.ceil(result.msBeforeNext * (1 + Math.random() * 0.25));
        await sleep(waitMs);
        await this.consumeImpl(points);
      } else {
        // Block synchronous request
        const outcome = deepClone(tooManyRequests);
        outcome.issue[0].diagnostics = JSON.stringify({ ...result, limit: this.limiter.points });
        throw new OperationOutcomeError(outcome);
      }
    }
  }

  async recordRead(num = 1): Promise<void> {
    return this.consume(Math.max(num, 1));
  }

  async recordHistory(): Promise<void> {
    return this.consume(10);
  }

  async recordSearch(num = 1): Promise<void> {
    return this.consume(20 * Math.max(num, 1));
  }

  async recordWrite(): Promise<void> {
    return this.consume(100);
  }

  get unitsConsumed(): number {
    return this.delta;
  }
}
