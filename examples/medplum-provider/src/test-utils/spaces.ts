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

// An SSE response the test feeds chunk by chunk, to observe state mid-stream
export function controlledStream(): ControlledStream {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  return {
    response: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (content) => controller?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)),
    close: () => controller?.close(),
  };
}

export function toCommunication(message: Message, seq: number): Communication {
  const contentString = JSON.stringify({ ...message, sequenceNumber: seq });
  return { resourceType: 'Communication', id: `msg-${seq}`, status: 'completed', payload: [{ contentString }] };
}

export type MockToolCall = { id?: string; function: { name: string; arguments: unknown } };

export function toolCallsResponse(toolCalls: MockToolCall[], visualize = false): Parameters {
  const parameter = [{ name: 'tool_calls', valueString: JSON.stringify(toolCalls) }];
  return { resourceType: 'Parameters', parameter: [...parameter, { name: 'visualize', valueBoolean: visualize }] };
}

export function contentResponse(content: string): Parameters {
  return { resourceType: 'Parameters', parameter: [{ name: 'content', valueString: content }] };
}

export function fhirRequestToolCall(id: string, method: string, path: string): MockToolCall {
  return { id, function: { name: 'fhir_request', arguments: JSON.stringify({ method, path }) } };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
