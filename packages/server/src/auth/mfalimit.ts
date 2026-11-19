// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import {
  badRequest,
  deepClone,
  OperationOutcomeError,
  resolveId,
  setRateLimitReset,
  tooManyRequests,
} from '@medplum/core';
import type { Login } from '@medplum/fhirtypes';
import { authenticator } from 'otplib';
import { getConfig } from '../config/loader';
import { MFA_LOGIN_ATTEMPT_LIMIT, MFA_LOGIN_EXPIRATION_MS, MFA_USER_ATTEMPT_LIMIT } from '../constants';
import { getRateLimitRedis } from '../redis';

// Atomically reserve attempt only when both the login and user remain below their limits.
const RESERVE_MFA_ATTEMPT = `
local loginCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local userCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if loginCount >= tonumber(ARGV[1]) then
  return {0, loginCount, userCount, redis.call('PTTL', KEYS[1])}
end
if userCount >= tonumber(ARGV[2]) then
  return {0, loginCount, userCount, redis.call('PTTL', KEYS[2])}
end
loginCount = redis.call('INCR', KEYS[1])
userCount = redis.call('INCR', KEYS[2])
if loginCount == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
if userCount == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[3]) end
return {1, loginCount, userCount, 0}
`;

// Clear a successful login while releasing only its reservation from the shared user counter.
const RELEASE_MFA_ATTEMPT = `
redis.call('DEL', KEYS[1])
local userCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if userCount <= 1 then
  return redis.call('DEL', KEYS[2])
end
return redis.call('DECR', KEYS[2])
`;

interface MfaRedisCommands {
  reserveMfaAttempt(
    loginKey: string,
    userKey: string,
    loginLimit: number,
    userLimit: number,
    expirationMs: number
  ): Promise<number[]>;
  releaseMfaAttempt(loginKey: string, userKey: string): Promise<unknown>;
}

/**
 * Atomically reserves one MFA attempt against both the login and its user.
 * @param login - The login attempting MFA.
 * @returns The number of attempts reserved for this login.
 */
export async function reserveMfaAttempt(login: Login): Promise<number> {
  const redis = getMfaRedis();
  const result = await redis.reserveMfaAttempt(
    ...getMfaAttemptKeys(login),
    MFA_LOGIN_ATTEMPT_LIMIT,
    MFA_USER_ATTEMPT_LIMIT,
    MFA_LOGIN_EXPIRATION_MS
  );
  if (result[0] !== 1) {
    const outcome = deepClone(tooManyRequests);
    setRateLimitReset(outcome, Math.max(result[3], 0));
    throw new OperationOutcomeError(outcome);
  }
  return result[1];
}

/**
 * Removes a successful attempt without discarding other concurrent user failures.
 * @param login - The successfully verified login.
 */
export async function releaseMfaAttempt(login: Login): Promise<void> {
  await getMfaRedis().releaseMfaAttempt(...getMfaAttemptKeys(login));
}

export async function tryReleaseMfaAttempt(logger: ILogger, login: Login): Promise<void> {
  try {
    await releaseMfaAttempt(login);
  } catch (err) {
    logger.error('Failed to release MFA attempt', { err });
  }
}

/**
 * Verifies an authenticator (TOTP) code and consumes it, so that each code is accepted at most once
 * per user (RFC 6238 section 5.2). An accepted code is remembered for as long as the authenticator
 * window could still accept it.
 * @param userId - The user that owns the secret.
 * @param secret - The authenticator secret.
 * @param token - The user supplied code.
 * @returns True if the code is valid and has not been used before.
 */
export async function verifyTotpToken(userId: string, secret: string, token: string): Promise<boolean> {
  const window = getConfig().mfaAuthenticatorWindow ?? 1;
  authenticator.options = { window };
  if (!authenticator.verify({ token, secret })) {
    return false;
  }
  // A verified token equals the generated code exactly, so the code identifies its time step
  const expirationMs = (2 * window + 1) * authenticator.allOptions().step * 1000;
  const claimed = await getRateLimitRedis().set(
    `${getMfaKeyPrefix(userId)}:totp:${token}`,
    '1',
    'PX',
    expirationMs,
    'NX'
  );
  return claimed === 'OK';
}

function getMfaAttemptKeys(login: Login): [string, string] {
  const userId = resolveId(login.user);
  if (!login.id || !userId) {
    throw new OperationOutcomeError(badRequest('Invalid login'));
  }
  const prefix = getMfaKeyPrefix(userId);
  return [`${prefix}:login:${login.id}`, `${prefix}:user`];
}

// The hash tag keeps all of a user's MFA keys in one cluster slot, as the attempt scripts require
function getMfaKeyPrefix(userId: string): string {
  return `medplum:mfa:{${userId}}`;
}

const configuredRedisClients = new WeakSet<object>();

function getMfaRedis(): ReturnType<typeof getRateLimitRedis> & MfaRedisCommands {
  const redis = getRateLimitRedis();
  if (!configuredRedisClients.has(redis)) {
    redis.defineCommand('reserveMfaAttempt', { numberOfKeys: 2, lua: RESERVE_MFA_ATTEMPT });
    redis.defineCommand('releaseMfaAttempt', { numberOfKeys: 2, lua: RELEASE_MFA_ATTEMPT });
    configuredRedisClients.add(redis);
  }
  return redis as ReturnType<typeof getRateLimitRedis> & MfaRedisCommands;
}

/**
 * Ensures that a login can still be used to complete MFA.
 * @param login - The login attempting MFA.
 */
export function assertMfaLoginActive(login: Login): void {
  if (login.revoked) {
    throw new OperationOutcomeError(badRequest('Login revoked'));
  }
  if (login.granted) {
    throw new OperationOutcomeError(badRequest('Login granted'));
  }
  if (login.mfaVerified) {
    throw new OperationOutcomeError(badRequest('Login already verified'));
  }
  if (login.authMethod !== 'password') {
    throw new OperationOutcomeError(badRequest('Invalid login authentication method'));
  }
  const authTime = Date.parse(login.authTime);
  if (!Number.isFinite(authTime) || Date.now() - authTime >= MFA_LOGIN_EXPIRATION_MS) {
    throw new OperationOutcomeError(badRequest('Login expired'));
  }
}
