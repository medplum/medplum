// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@medplum/core';
import { deepClone, LRUCache, OperationOutcomeError, sleep, tooManyRequests } from '@medplum/core';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { getConfig } from '../config/loader';
import type { AuthState } from '../oauth/middleware';

export const FHIR_RATE_LIMIT_MEMBERSHIP_PREFIX = 'medplum:rl:fhir:membership:';
export const FHIR_RATE_LIMIT_PROJECT_PREFIX = 'medplum:rl:fhir:project:';
export const FHIR_RATE_LIMIT_ACTIVE_PREFIX = 'medplum:rl:fhir:active:';
export const FHIR_RATE_LIMIT_DURATION = 60;
export const FHIR_RATE_LIMIT_ACTIVE_TTL = 120;

export interface FhirQuotaConfig {
  userLimit: number;
  projectLimit: number;
}

export function getFhirQuotaConfig(authState: AuthState): FhirQuotaConfig {
  const { project, userConfig } = authState;
  const defaultUserLimit = project?.systemSetting?.find((s) => s.name === 'userFhirQuota')?.valueInteger;
  const userSpecificLimit = userConfig.option?.find((o) => o.id === 'fhirQuota')?.valueInteger;
  const userLimit = userSpecificLimit ?? defaultUserLimit ?? getConfig().defaultFhirQuota;

  const perProjectLimit = project?.systemSetting?.find((s) => s.name === 'totalFhirQuota')?.valueInteger;
  const projectLimit = perProjectLimit ?? userLimit * 10;

  return { userLimit, projectLimit };
}

type InMemoryBlock = {
  result: RateLimiterRes;
  resetTimestamp: number;
};
const blockedUsers = new LRUCache<InMemoryBlock>(1000);

export function getActiveRateLimitKey(projectId: string, minuteBucket?: number): string {
  const bucket = minuteBucket ?? Math.floor(Date.now() / 60_000);
  return `${FHIR_RATE_LIMIT_ACTIVE_PREFIX}${projectId}:${bucket}`;
}

export class FhirRateLimiter {
  private readonly redis: Redis;
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
    this.redis = redis;
    this.limiter = new RateLimiterRedis({
      keyPrefix: FHIR_RATE_LIMIT_MEMBERSHIP_PREFIX,
      storeClient: redis,
      points: userLimit,
      duration: FHIR_RATE_LIMIT_DURATION,
    });
    this.userKey = authState.membership.id;

    this.projectLimiter = new RateLimiterRedis({
      keyPrefix: FHIR_RATE_LIMIT_PROJECT_PREFIX,
      storeClient: redis,
      points: projectLimit,
      duration: FHIR_RATE_LIMIT_DURATION,
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

  getMembershipKey(membershipId: string): string {
    return this.limiter.getKey(membershipId);
  }

  getProjectKey(): string {
    return this.projectLimiter.getKey(this.projectKey);
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
    if (this.async) {
      // Do not enforce rate limits in async context; instead, slow down the consumer
      // in proportion to the weight of the operation being performed
      await sleep(points * (getConfig().asyncDelayScaling ?? 1));
      return;
    }

    // If user is already over the limit, just block
    if (this.current && this.current.remainingPoints <= 0) {
      await this.block(points, this.current);
      return;
    }
    await this.consumeImpl(points);
  }

  private async consumeImpl(points: number): Promise<void> {
    this.delta += points;
    await this.checkInMemoryBlock(points);

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
      this.trackActiveConsumer(result.consumedPoints);
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
      const result = err;
      this.setState(result);
      this.trackActiveConsumer(result.consumedPoints);
      this.logger.warn('User rate limited', {
        limit: this.limiter.points,
        used: result.consumedPoints,
        msToReset: result.msBeforeNext,
        enabled: this.enabled,
      });
      await this.block(points, result);
    }
  }

  async checkInMemoryBlock(points: number): Promise<void> {
    const userBlock = blockedUsers.get(this.userKey);
    if (userBlock) {
      if (Date.now() <= userBlock.resetTimestamp) {
        this.setState(userBlock.result);
        await this.block(points, userBlock.result);
      } else {
        blockedUsers.delete(this.userKey);
      }
    }
    return undefined;
  }

  private trackActiveConsumer(consumedPoints: number): void {
    const currentBucket = Math.floor(Date.now() / 60_000);
    const currentKey = getActiveRateLimitKey(this.projectKey, currentBucket);
    const nextKey = getActiveRateLimitKey(this.projectKey, currentBucket + 1);

    const pipeline = this.redis.pipeline();
    pipeline.zadd(currentKey, 'GT', consumedPoints, this.userKey);
    pipeline.expire(currentKey, FHIR_RATE_LIMIT_ACTIVE_TTL);
    pipeline.zadd(nextKey, 'GT', consumedPoints, this.userKey);
    pipeline.expire(nextKey, FHIR_RATE_LIMIT_ACTIVE_TTL);
    pipeline.exec().catch((err) => {
      this.logger.error('Error tracking active rate limit consumer', err);
    });
  }

  /**
   * Block the request, either by throwing an error to induce a 429 error response,
   * or by waiting until more quota is available and retrying.
   *
   * @param points - The number of points being consumed.
   * @param result - The over-limit rate limiter result.
   * @throws {OperationOutcomeError} 429 error
   */
  async block(points: number, result: RateLimiterRes): Promise<void> {
    if (this.enabled) {
      blockedUsers.set(this.userKey, { result, resetTimestamp: Date.now() + result.msBeforeNext });

      const outcome = deepClone(tooManyRequests);
      outcome.issue[0].diagnostics = JSON.stringify({ ...result, limit: this.limiter.points });
      throw new OperationOutcomeError(outcome);
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
