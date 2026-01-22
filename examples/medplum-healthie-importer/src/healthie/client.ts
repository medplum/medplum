// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Generic type for adding cursor to any Healthie type for pagination.
 */
export type WithCursor<T> = T & { cursor?: string };

/**
 * Default retry configuration.
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

/**
 * HTTP status codes that warrant a retry.
 */
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

/**
 * GraphQL error codes that warrant a retry.
 * Healthie returns rate limit errors as GraphQL errors, not HTTP 429.
 */
const RETRYABLE_GRAPHQL_ERROR_CODES = ['TOO_MANY_REQUESTS'];

/**
 * Options for the Healthie client.
 */
export interface HealthieClientOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelayMs?: number;
}

/**
 * HealthieClient provides methods to interact with the Healthie API.
 */
export class HealthieClient {
  private baseURL: string;
  private clientSecret: string;
  private maxRetries: number;
  private baseDelayMs: number;
  private maxDelayMs: number;

  /**
   * Creates a new HealthieClient instance.
   * @param baseURL - The base URL for the Healthie API.
   * @param clientSecret - The API secret for authentication.
   * @param options - Optional configuration for retries.
   */
  constructor(baseURL: string, clientSecret: string, options: HealthieClientOptions = {}) {
    this.baseURL = baseURL;
    this.clientSecret = clientSecret;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  }

  /**
   * Sleeps for the specified duration.
   * @param ms - Duration in milliseconds.
   * @returns A promise that resolves after the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Calculates the delay for exponential backoff with jitter.
   * @param attempt - The current attempt number (0-indexed).
   * @returns Delay in milliseconds.
   */
  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt);
    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.min(exponentialDelay + jitter, this.maxDelayMs);
    return Math.max(0, delay);
  }

  /**
   * Executes a GraphQL query against the Healthie API with retry logic.
   * @param query - The GraphQL query string.
   * @param variables - Optional variables for the GraphQL query.
   * @returns The query result data.
   */
  async query<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
    if (!this.clientSecret) {
      throw new Error('Healthie credentials not provided');
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.baseURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.clientSecret}`,
            AuthorizationSource: 'API',
          },
          body: JSON.stringify({
            query,
            variables,
          }),
        });

        // Check for rate limiting or server errors that warrant retry
        if (RETRYABLE_STATUS_CODES.includes(response.status)) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.calculateBackoffDelay(attempt);

          if (attempt < this.maxRetries) {
            console.log(
              `Healthie API returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`
            );
            await this.sleep(delay);
            continue;
          }
        }

        const result = (await response.json()) as HealthieGraphQLResponse<T>;

        if (result.errors && result.errors.length > 0) {
          // Check if any errors are retryable (e.g., rate limits)
          const hasRetryableError = result.errors.some((e) => {
            const code = e.code ?? e.extensions?.code;
            return code && RETRYABLE_GRAPHQL_ERROR_CODES.includes(code);
          });

          if (hasRetryableError && attempt < this.maxRetries) {
            const delay = this.calculateBackoffDelay(attempt);
            console.log(
              `Healthie API rate limited (TOO_MANY_REQUESTS), retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`
            );
            await this.sleep(delay);
            continue;
          }

          throw new Error(`GraphQL Error: ${result.errors.map((e) => e.message).join(', ')}`);
        }

        if (!result.data) {
          throw new Error('No data returned from Healthie API');
        }

        return result.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on non-retryable errors (like GraphQL errors)
        if (
          lastError.message.startsWith('GraphQL Error:') ||
          lastError.message === 'No data returned from Healthie API'
        ) {
          throw lastError;
        }

        // Retry on network errors
        if (attempt < this.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(
            `Healthie API request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}): ${lastError.message}`
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Healthie API request failed after all retries');
  }
}

/**
 * Interface for Healthie GraphQL API responses.
 */
interface HealthieGraphQLResponse<T> {
  data?: T;
  errors?: HealthieGraphQLError[];
}

/**
 * Interface for Healthie GraphQL errors.
 */
interface HealthieGraphQLError {
  message: string;
  /** Error code - e.g., 'TOO_MANY_REQUESTS' for rate limits */
  code?: string;
  extensions?: {
    code?: string;
  };
}
