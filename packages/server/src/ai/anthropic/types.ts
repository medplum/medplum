// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** An error in the Anthropic Messages API shape. */
export interface AnthropicError {
  type: 'error';
  error: { type: string; message: string };
}

/**
 * A provider failure converted for the client.
 *
 * - `status`: the HTTP status to return.
 * - `body`: the Anthropic error body to return.
 * - `misconfigured`: true when the failure is caused by the server's own setup, not the request.
 */
export interface AnthropicProviderError {
  status: number;
  body: AnthropicError;
  misconfigured: boolean;
}

/**
 * A service that serves the Anthropic Messages API.
 *
 * Request bodies are Anthropic Messages bodies without `model` and `stream`.
 *
 * - `isModelSupported`: returns true if the provider can serve the model ID.
 * - `createMessage`: resolves to the Anthropic message as JSON text.
 * - `streamMessage`: resolves to the Anthropic stream events, each as JSON text.
 * - `toError`: converts an error thrown by the provider.
 */
export interface AnthropicMessagesProvider {
  isModelSupported(model: string): boolean;
  createMessage(model: string, body: Record<string, unknown>, betas: string[], signal: AbortSignal): Promise<string>;
  streamMessage(
    model: string,
    body: Record<string, unknown>,
    betas: string[],
    signal: AbortSignal
  ): Promise<AsyncIterable<string>>;
  toError(err: unknown): AnthropicProviderError;
}

/**
 * Returns the Anthropic error type for an HTTP status.
 * @param status - The HTTP status.
 * @returns The Anthropic error type.
 */
export function anthropicErrorType(status: number): string {
  switch (status) {
    case 400:
      return 'invalid_request_error';
    case 401:
      return 'authentication_error';
    case 403:
      return 'permission_error';
    case 404:
      return 'not_found_error';
    case 413:
      return 'request_too_large';
    case 429:
      return 'rate_limit_error';
    case 503:
    case 529:
      return 'overloaded_error';
    default:
      return 'api_error';
  }
}
