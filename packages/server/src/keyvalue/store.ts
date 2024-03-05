import { OperationOutcomeError, badRequest, notFound } from '@medplum/core';
import { AuthenticatedRequestContext, getAuthenticatedContext } from '../context';
import { getRedis } from '../redis';

export const MAX_KEY_LENGTH = 255;
export const MAX_VALUE_LENGTH = 8192;
export const MAX_ITEMS = 10;

/**
 * Gets the value for the given key from the keyvalue store.
 * @param key - The key to get the value for.
 * @returns The value for the given key.
 */
export async function getValue(key: string): Promise<string> {
  validateKey(key);
  const ctx = getAuthenticatedContext();
  const value = await getRedis().hget(getCacheKey(ctx), key);
  if (value === null) {
    throw new OperationOutcomeError(notFound);
  }
  return value;
}

/**
 * Sets the value for the given key in the keyvalue store.
 * @param key - The key to set the value for.
 * @param value - The value to set.
 */
export async function setValue(key: string, value: string): Promise<void> {
  validateKey(key);
  if (typeof value !== 'string') {
    throw new OperationOutcomeError(badRequest('Invalid value type'));
  }
  if (value.length > MAX_VALUE_LENGTH) {
    throw new OperationOutcomeError(badRequest('Value too long'));
  }
  const ctx = getAuthenticatedContext();
  const cacheKey = getCacheKey(ctx);
  const redis = getRedis();
  const exists = await redis.hexists(cacheKey, key);
  if (!exists) {
    const length = await redis.hlen(cacheKey);
    if (length >= MAX_ITEMS) {
      throw new OperationOutcomeError(badRequest('Max items exceeded'));
    }
  }
  await redis.hset(cacheKey, key, value);
}

/**
 * Deletes the value for the given key from the keyvalue store.
 * @param key - The key to delete the value for.
 */
export async function deleteValue(key: string): Promise<void> {
  validateKey(key);
  const ctx = getAuthenticatedContext();
  await getRedis().hdel(getCacheKey(ctx), key);
}

/**
 * Validates the key string.
 * @param key - The key to validate.
 * @returns The key string or undefined if invalid.
 */
function validateKey(key: string): string {
  if (!key || typeof key !== 'string' || key.length > MAX_KEY_LENGTH) {
    throw new OperationOutcomeError(badRequest('Invalid key'));
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    throw new OperationOutcomeError(badRequest('Invalid key'));
  }
  return key;
}

/**
 * Returns the Redis cache key for the user's project membership.
 * The Redis cache key points to a Redis "hash" type: https://redis.io/docs/data-types/hashes/
 * All of the user's key/value pairs are entries in that hash object.
 * @param ctx - The request context.
 * @returns The Redis cache key.
 */
function getCacheKey(ctx: AuthenticatedRequestContext): string {
  return `medplum:keyvalue:${ctx.membership.id}`;
}
