// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { AnthropicMessagesProvider, AnthropicProviderError } from '../../ai/anthropic/types';
import { anthropicErrorType } from '../../ai/anthropic/types';

/** The `anthropic_version` that Bedrock requires in place of the `anthropic-version` header. */
export const BEDROCK_ANTHROPIC_VERSION = 'bedrock-2023-05-31';

/** An Anthropic model ID on Bedrock, optionally with a cross-region inference profile prefix. */
const BEDROCK_ANTHROPIC_MODEL = /^((us|eu|apac|global)\.)?anthropic\.claude-[a-z0-9.:-]+$/;

const DEFAULT_ERROR_MESSAGE = 'Upstream model error';

/** Text that identifies server-side resources rather than the request. */
const SERVER_DETAIL = /arn:|\d{12}/i;

/** Serves the Anthropic Messages API with Anthropic models on AWS Bedrock. */
export class BedrockAnthropicProvider implements AnthropicMessagesProvider {
  private readonly client: BedrockRuntimeClient;

  /**
   * @param region - The AWS region to call Bedrock in.
   */
  constructor(region: string) {
    this.client = new BedrockRuntimeClient({ region });
  }

  isModelSupported(model: string): boolean {
    return BEDROCK_ANTHROPIC_MODEL.test(model);
  }

  async createMessage(
    model: string,
    body: Record<string, unknown>,
    betas: string[],
    signal: AbortSignal
  ): Promise<string> {
    const command = new InvokeModelCommand(toBedrockCommand(model, body, betas));
    const output = await this.client.send(command, { abortSignal: signal });
    return output.body.transformToString();
  }

  async streamMessage(
    model: string,
    body: Record<string, unknown>,
    betas: string[],
    signal: AbortSignal
  ): Promise<AsyncIterable<string>> {
    const command = new InvokeModelWithResponseStreamCommand(toBedrockCommand(model, body, betas));
    const output = await this.client.send(command, { abortSignal: signal });
    return decodeChunks(output.body);
  }

  /**
   * Converts a Bedrock SDK error to an HTTP status and an Anthropic error body.
   *
   * Request validation messages describe the request body, so they are returned as is.
   * Every other error gets a generic message; the status and error type identify the failure.
   * An upstream 401, or a 403 that names server-side resources, describes the server's own
   * configuration, so it is returned as 500 and flagged as `misconfigured`. Any other upstream 403
   * means the model is not enabled for the account, so it is returned as 404.
   * @param err - The error thrown by the Bedrock SDK.
   * @returns The HTTP status, the Anthropic error body, and whether the server is misconfigured.
   */
  toError(err: unknown): AnthropicProviderError {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    const upstream = e.$metadata?.httpStatusCode ?? 500;
    const serverDetail = !e.message || SERVER_DETAIL.test(e.message);
    const misconfigured = upstream === 401 || (upstream === 403 && serverDetail);
    let status = upstream;
    let message = DEFAULT_ERROR_MESSAGE;
    if (misconfigured) {
      status = 500;
    } else if (upstream === 403) {
      status = 404;
      message = 'Model not available';
    } else if (e.name === 'ValidationException' && e.message && !serverDetail) {
      message = e.message;
    }
    return { status, body: { type: 'error', error: { type: anthropicErrorType(status), message } }, misconfigured };
  }
}

/**
 * Converts an Anthropic Messages request body to a Bedrock InvokeModel body.
 *
 * Bedrock takes the model from the URL and streaming from the command, reads `anthropic_version`
 * from the body, and reads beta flags from `anthropic_beta` instead of the `anthropic-beta` header.
 * Everything else is passed through unchanged.
 * @param body - The Anthropic Messages request body, without `model` and `stream`.
 * @param betas - The beta flags from the `anthropic-beta` request header.
 * @returns The Bedrock InvokeModel body.
 */
export function toBedrockBody(body: Record<string, unknown>, betas: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = { anthropic_version: BEDROCK_ANTHROPIC_VERSION, ...body };
  if (betas.length && result.anthropic_beta === undefined) {
    result.anthropic_beta = betas;
  }
  return result;
}

function toBedrockCommand(
  model: string,
  body: Record<string, unknown>,
  betas: string[]
): { modelId: string; contentType: string; accept: string; body: string } {
  return {
    modelId: model,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(toBedrockBody(body, betas)),
  };
}

/**
 * Decodes a Bedrock response stream. Each chunk is one Anthropic stream event.
 * @param body - The Bedrock response stream.
 * @yields The Anthropic stream events as JSON text.
 */
async function* decodeChunks(
  body: AsyncIterable<{ chunk?: { bytes?: Uint8Array } }> | undefined
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  for await (const event of body ?? []) {
    if (event.chunk?.bytes) {
      yield decoder.decode(event.chunk.bytes);
    }
  }
}
