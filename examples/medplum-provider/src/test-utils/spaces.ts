// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication, Parameters } from '@medplum/fhirtypes';
import type { Message } from '../types/spaces';

export const mockTopic: Communication = {
  resourceType: 'Communication',
  id: 'topic-123',
  status: 'in-progress',
  identifier: [
    {
      system: 'http://medplum.com/ai-message',
      value: 'ai-message-topic',
    },
  ],
  topic: {
    text: 'Test conversation',
  },
};

/**
 * Builds an SSE response that delivers one content chunk and completes.
 * @param content - The chunk to stream
 * @returns The streaming response
 */
export function createMockStreamingResponse(content: string): Response {
  const encoder = new TextEncoder();
  const sseData = `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseData));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

export interface ControlledStream {
  response: Response;
  push: (content: string) => void;
  close: () => void;
}

/**
 * Builds an SSE response the test feeds chunk by chunk, to observe state mid-stream.
 * @returns The response plus push and close controls
 */
export function controlledStream(): ControlledStream {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  return {
    response: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (content) => controller?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)),
    close: () => controller?.close(),
  };
}

/**
 * Builds a persisted message, as loadConversationMessages reads it back.
 * @param message - The message to persist
 * @param seq - Its sequence number in the conversation
 * @returns The Communication resource
 */
export function toCommunication(message: Message, seq: number): Communication {
  const contentString = JSON.stringify({ ...message, sequenceNumber: seq });
  return { resourceType: 'Communication', id: `msg-${seq}`, status: 'completed', payload: [{ contentString }] };
}

export type MockToolCall = { id?: string; function: { name: string; arguments: unknown } };

/**
 * Builds a translator bot response requesting tool calls.
 * @param toolCalls - The tool calls to request
 * @param visualize - Whether the bot asks for a visualization
 * @returns The bot response
 */
export function toolCallsResponse(toolCalls: MockToolCall[], visualize = false): Parameters {
  const parameter = [{ name: 'tool_calls', valueString: JSON.stringify(toolCalls) }];
  return { resourceType: 'Parameters', parameter: [...parameter, { name: 'visualize', valueBoolean: visualize }] };
}

/**
 * Builds a translator bot response with a final answer.
 * @param content - The answer text
 * @returns The bot response
 */
export function contentResponse(content: string): Parameters {
  return { resourceType: 'Parameters', parameter: [{ name: 'content', valueString: content }] };
}

/**
 * Builds a fhir_request tool call.
 * @param id - The tool call id
 * @param method - The HTTP method
 * @param path - The FHIR path
 * @returns The tool call
 */
export function fhirRequestToolCall(id: string, method: string, path: string): MockToolCall {
  return { id, function: { name: 'fhir_request', arguments: JSON.stringify({ method, path }) } };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Creates a promise the test resolves or rejects by hand.
 * @returns The promise and its settle functions
 */
export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
