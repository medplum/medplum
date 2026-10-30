// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

/** The `anthropic_version` that Bedrock requires in place of the `anthropic-version` header. */
export const BEDROCK_ANTHROPIC_VERSION = 'bedrock-2023-05-31';

const clients = new Map<string, BedrockRuntimeClient>();

/**
 * Returns a Bedrock runtime client for the region, created on first use.
 * @param region - The AWS region.
 * @returns The Bedrock runtime client.
 */
export function getBedrockClient(region: string): BedrockRuntimeClient {
  let client = clients.get(region);
  if (!client) {
    client = new BedrockRuntimeClient({ region });
    clients.set(region, client);
  }
  return client;
}

/**
 * Converts an Anthropic Messages request body to a Bedrock InvokeModel body.
 *
 * Bedrock takes the model from the URL and streaming from the command, reads `anthropic_version`
 * from the body, and reads beta flags from `anthropic_beta` instead of the `anthropic-beta` header.
 * Everything else is passed through unchanged.
 * @param body - The Anthropic Messages request body.
 * @param betaHeader - The `anthropic-beta` request header, if any.
 * @returns The Bedrock InvokeModel body.
 */
export function toBedrockBody(body: Record<string, unknown>, betaHeader: string | undefined): Record<string, unknown> {
  const { model: _model, stream: _stream, ...rest } = body;
  const result: Record<string, unknown> = { anthropic_version: BEDROCK_ANTHROPIC_VERSION, ...rest };
  const betas = betaHeader
    ?.split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  if (betas?.length && result.anthropic_beta === undefined) {
    result.anthropic_beta = betas;
  }
  return result;
}

/** An error in the Anthropic Messages API shape. */
export interface AnthropicError {
  type: 'error';
  error: { type: string; message: string };
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

/**
 * Converts a Bedrock SDK error to an HTTP status and an Anthropic error body.
 * @param err - The error thrown by the Bedrock SDK.
 * @returns The HTTP status and Anthropic error body.
 */
export function toAnthropicError(err: unknown): { status: number; body: AnthropicError } {
  const e = err as { $metadata?: { httpStatusCode?: number }; message?: string };
  const status = e.$metadata?.httpStatusCode ?? 500;
  const message = status < 500 && e.message ? e.message : 'Upstream model error';
  return { status, body: { type: 'error', error: { type: anthropicErrorType(status), message } } };
}
