import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedis } from './redis';

let handler: RateLimitRequestHandler | undefined = undefined;
let store: RedisStore | undefined = undefined;

export function getRateLimiter(): RateLimitRequestHandler {
  if (!handler) {
    const client = getRedis();
    store = new RedisStore({
      // @ts-expect-error - Known issue: the `call` function is not present in @types/ioredis
      sendCommand: (...args: string[]): unknown => client.call(...args),
    });
    handler = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 600, // limit each IP to 600 requests per windowMs
      validate: false, // Ignore X-Forwarded-For warnings
      store,
    });
  }
  return handler;
}

export function closeRateLimiter(): void {
  if (handler) {
    store = undefined;
    handler = undefined;
  }
}
