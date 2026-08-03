// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * What a caller asks the model to do.
 *
 * `messages` and `tools` are pass-through JSON in whatever shape the caller supplied, so they
 * stay untyped — each provider is responsible for translating them to its own wire format.
 * @param messages - The messages to send to the model
 * @param model - The model to use for the request
 * @param tools - The tools to use for the request
 * @param temperature - The temperature to use for the request  
 */
export interface AiRequest {
  readonly messages: any[];
  readonly model: string;
  readonly tools?: any[];
  readonly temperature?: number;
}

/**
 * An {@link AiRequest} plus the credentials to fulfill it.
 *
 * Credentials are resolved per request rather than held in a module singleton, because they
 * come from `Project.secret` and therefore differ between projects on the same server.
 * @param apiKey - The API key to use for the request
 * @param baseUrl - The base URL of the provider's API, with no trailing slash
 */
export interface AiContext extends AiRequest {
  readonly apiKey: string;
  readonly baseUrl: string;
}

/**
 * A tool call the model requested.
 *
 * `arguments` is already parsed. Providers stream it as string fragments, so a truncated or
 * malformed call arrives here as the raw string instead — callers should expect either.
 */
export interface AiToolCall {
  readonly id?: string;
  readonly type: string;
  readonly function: {
    readonly name?: string;
    readonly arguments: unknown;
  };
}

/** The complete result of a non-streaming call. */
export interface AiResult {
  readonly content: string | null;
  readonly toolCalls: AiToolCall[];
}

/**
 * A provider-neutral event from a streaming call.
 *
 * Content arrives incrementally and is emitted as it does. Tool calls are only actionable once
 * complete, so a provider emits at most one `tool_calls` event, after all content.
 */
export type AiStreamEvent =
  | { readonly type: 'content'; readonly text: string }
  | { readonly type: 'tool_calls'; readonly toolCalls: AiToolCall[] };
