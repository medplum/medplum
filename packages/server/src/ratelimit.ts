import rateLimit, { IncrementResponse, Options, RateLimitRequestHandler, Store } from 'express-rate-limit';

let handler: RateLimitRequestHandler | undefined = undefined;
let store: MemoryStore | undefined = undefined;

export function getRateLimiter(): RateLimitRequestHandler {
  if (!handler) {
    store = new MemoryStore();
    handler = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
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

/**
 * Calculates the time when all hit counters will be reset.
 *
 * @param windowMs - The duration of a window (in milliseconds).
 */
const calculateNextResetTime = (windowMs: number): Date => {
  const resetTime = new Date();
  resetTime.setMilliseconds(resetTime.getMilliseconds() + windowMs);
  return resetTime;
};

/**
 * A `Store` that stores the hit count for each client in memory.
 */
export default class MemoryStore implements Store {
  /**
   * The duration of time before which all hit counts are reset (in milliseconds).
   */
  windowMs!: number;

  /**
   * The map that stores the number of hits for each client in memory.
   */
  hits!: { [key: string]: number | undefined };

  /**
   * The time at which all hit counts will be reset.
   */
  resetTime!: Date;

  /**
   * Reference to the active timer.
   */
  interval?: NodeJS.Timer;

  /**
   * Method that initializes the store.
   *
   * @param options The options used to setup the middleware.
   */
  init(options: Options): void {
    // Get the duration of a window from the options
    this.windowMs = options.windowMs;

    // Then calculate the reset time using that
    this.resetTime = calculateNextResetTime(this.windowMs);

    // Initialise the hit counter map
    this.hits = {};

    // Reset hit counts for ALL clients every `windowMs` - this will also
    // re-calculate the `resetTime`
    this.interval = setInterval(async () => await this.resetAll(), this.windowMs);
    this.interval.unref();
  }

  shutdown(): void {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /**
   * Method to increment a client's hit counter.
   *
   * @param key The identifier for a client.
   * @returns The number of hits and reset time for that client.
   */
  async increment(key: string): Promise<IncrementResponse> {
    const totalHits = (this.hits[key] ?? 0) + 1;
    this.hits[key] = totalHits;

    return {
      totalHits,
      resetTime: this.resetTime,
    };
  }

  /**
   * Method to decrement a client's hit counter.
   *
   * @param key The identifier for a client.
   */
  async decrement(key: string): Promise<void> {
    const current = this.hits[key];
    if (current) {
      this.hits[key] = current - 1;
    }
  }

  /**
   * Method to reset a client's hit counter.
   *
   * @param key The identifier for a client.
   */
  async resetKey(key: string): Promise<void> {
    delete this.hits[key];
  }

  /**
   * Method to reset everyone's hit counter.
   */
  async resetAll(): Promise<void> {
    this.hits = {};
    this.resetTime = calculateNextResetTime(this.windowMs);
  }
}
