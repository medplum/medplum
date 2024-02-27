import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { AuthenticatedRequestContext, getAuthenticatedContext } from '../context';
import { authenticateRequest } from '../oauth/middleware';
import { getRedis } from '../redis';

const REDIS_CACHE_EX_SECONDS = 24 * 60 * 60; // 24 hours in seconds

export const keyValueRouter = Router();
keyValueRouter.use(authenticateRequest);

keyValueRouter.get(
  '/:key',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const key = validateKey(req, res);
    if (!key) {
      return;
    }
    const value = await getRedis().get(getCacheKey(ctx, key));
    if (value === null) {
      res.status(404).send('Not found');
    } else {
      res.status(200).send(value);
    }
  })
);

keyValueRouter.put(
  '/:key',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const key = validateKey(req, res);
    if (!key) {
      return;
    }
    const body = req.body;
    if (typeof body !== 'string') {
      res.status(400).send('Invalid value type');
      return;
    }
    if (body.length > 8192) {
      res.status(400).send('Value too long');
      return;
    }
    await getRedis().set(getCacheKey(ctx, key), req.body, 'EX', REDIS_CACHE_EX_SECONDS);
    res.sendStatus(204);
  })
);

keyValueRouter.delete(
  '/:key',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const key = validateKey(req, res);
    if (!key) {
      return;
    }
    await getRedis().del(getCacheKey(ctx, key));
    res.sendStatus(204);
  })
);

/**
 * Validates the key string.
 * @param req - The request object.
 * @param res - The response object.
 * @returns The key string or undefined if invalid.
 */
function validateKey(req: Request, res: Response): string | undefined {
  const key = req.params.key;
  if (!key || typeof key !== 'string' || key.length < 1 || key.length > 255) {
    res.status(400).send('Invalid key');
    return undefined;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    res.status(400).send('Invalid key');
    return undefined;
  }
  return key;
}

/**
 * Returns the Redis cache key for the given project and key.
 * Validates the key string is an alphanumeric string from 1-255 characters.
 * @param ctx - The request context.
 * @param key - The key to validate.
 * @returns The Redis cache key.
 */
function getCacheKey(ctx: AuthenticatedRequestContext, key: string): string {
  return `medplum:keyvalue:${ctx.membership.id}:${key}`;
}
