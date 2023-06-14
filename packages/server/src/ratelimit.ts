import rateLimit, { MemoryStore, RateLimitRequestHandler } from 'express-rate-limit';

/*
 * MemoryStore must be shutdown to cleanly stop the server.
 */

let handler: RateLimitRequestHandler | undefined = undefined;
let store: MemoryStore | undefined = undefined;

export function getRateLimiter(): RateLimitRequestHandler {
  if (!handler) {
    store = new MemoryStore();
    handler = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 6000, // limit each IP to 600 requests per windowMs
      store,
    });
  }
  return handler;
}

export function closeRateLimiter(): void {
  if (handler) {
    store?.shutdown();
    store = undefined;
    handler = undefined;
  }
}
