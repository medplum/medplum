// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, normalizeErrorString } from '@medplum/core';
import type { IncomingMessage } from 'node:http';
import type { RawData, WebSocket as IncomingWebSocket } from 'ws';
import WebSocket from 'ws';
import { globalLogger } from '../logger';
import { getLoginForAccessToken } from '../oauth/utils';

const OPENAI_REALTIME_FEATURE = 'openai-realtime-transcription';
const OPENAI_API_KEY_SECRET_NAME = 'OPENAI_API_KEY';
type OpenAIRealtimeIntent = 'transcription';

export interface OpenAIRealtimeConnectRequest {
  type: 'ai-realtime:connect';
  accessToken: string;
}

type OpenAIRealtimeControlMessage = OpenAIRealtimeConnectRequest;

type OpenAIRealtimeWebSocketFactory = (apiKey: string, intent: OpenAIRealtimeIntent) => WebSocket;

let openAIRealtimeWebSocketFactory: OpenAIRealtimeWebSocketFactory = defaultCreateOpenAIRealtimeWebSocket;

export function setOpenAIRealtimeWebSocketFactoryForTest(
  factory: OpenAIRealtimeWebSocketFactory | undefined
): void {
  openAIRealtimeWebSocketFactory = factory ?? defaultCreateOpenAIRealtimeWebSocket;
}

export async function handleAiRealtimeConnection(
  socket: IncomingWebSocket,
  request: IncomingMessage
): Promise<void> {
  const socketId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let closed = false;
  let connected = false;
  let connecting = false;
  let upstreamSocket: WebSocket | undefined;

  globalLogger.info('[WS] OpenAI realtime socket connected', {
    socketId,
    remoteAddress: request.socket.remoteAddress,
  });

  socket.on('message', async (data: RawData, isBinary: boolean) => {
    if (!connected) {
      if (connecting) {
        sendError('Upstream websocket is still connecting');
        return;
      }

      if (isBinary) {
        sendError('Expected JSON connect message before proxying data');
        closeClient(1008);
        return;
      }

      let message: OpenAIRealtimeControlMessage;
      try {
        message = JSON.parse((data as Buffer).toString('utf8')) as OpenAIRealtimeControlMessage;
      } catch (err) {
        sendError(`Invalid connect message: ${normalizeErrorString(err)}`);
        closeClient(1008);
        return;
      }

      if (message.type !== 'ai-realtime:connect') {
        sendError('Expected ai-realtime:connect as the first message');
        closeClient(1008);
        return;
      }

      if (!message.accessToken) {
        sendError('Missing access token');
        closeClient(1008);
        return;
      }

      try {
        connecting = true;
        await connectToUpstream(message.accessToken);
      } catch (err) {
        sendError(normalizeErrorString(err));
        closeClient(1011);
      }
      return;
    }

    if (upstreamSocket?.readyState !== WebSocket.OPEN) {
      sendError('Upstream websocket is not connected');
      closeClient(1011);
      return;
    }

    upstreamSocket.send(data, { binary: isBinary });
  });

  socket.on('close', () => {
    if (closed) {
      return;
    }
    closed = true;
    globalLogger.info('[WS] OpenAI realtime socket disconnected', { socketId });
    if (upstreamSocket && upstreamSocket.readyState < WebSocket.CLOSING) {
      upstreamSocket.close();
    }
  });

  async function connectToUpstream(accessToken: string): Promise<void> {
    const authResult = await getLoginForAccessToken(undefined, accessToken);
    if (!authResult) {
      sendError('Invalid access token');
      closeClient(1008);
      return;
    }

    const { project } = authResult.authState;
    if (!hasProjectFeature(project.features, OPENAI_REALTIME_FEATURE)) {
      sendError('OpenAI realtime transcription is not enabled for this project');
      closeClient(1008);
      return;
    }

    const apiKey = project.secret?.find((s) => s.name === OPENAI_API_KEY_SECRET_NAME)?.valueString;
    if (!apiKey) {
      sendError('OpenAI API key not configured in project secrets');
      closeClient(1011);
      return;
    }

    upstreamSocket = openAIRealtimeWebSocketFactory(apiKey, 'transcription');
    bindUpstreamSocket(upstreamSocket);
  }

  function bindUpstreamSocket(upstream: WebSocket): void {
    upstream.on('open', () => {
      connecting = false;
      connected = true;
      sendControlMessage({ type: 'ai-realtime:connected' });
    });

    upstream.on('message', (data, isBinary) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data, { binary: isBinary });
      }
    });

    upstream.on('unexpected-response', (_request, response) => {
      connecting = false;
      sendError(`Upstream connection failed with status ${response.statusCode ?? 502}`);
      closeClient(1011);
    });

    upstream.on('error', (err) => {
      connecting = false;
      globalLogger.error('[WS] OpenAI realtime upstream error', { socketId, error: err });
      if (!connected) {
        sendError(`Upstream websocket error: ${normalizeErrorString(err)}`);
      }
    });

    upstream.on('close', (code, reason) => {
      connecting = false;
      if (socket.readyState < WebSocket.CLOSING) {
        socket.close(normalizeCloseCode(code), reason.toString('utf8'));
      }
    });
  }

  function sendError(body: string): void {
    sendControlMessage({ type: 'ai-realtime:error', body, resource: badRequest(body) });
  }

  function sendControlMessage(message: Record<string, unknown>): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message), { binary: false });
    }
  }

  function closeClient(code: number): void {
    if (socket.readyState < WebSocket.CLOSING) {
      socket.close(code);
    }
    if (upstreamSocket && upstreamSocket.readyState < WebSocket.CLOSING) {
      upstreamSocket.close();
    }
  }
}

function defaultCreateOpenAIRealtimeWebSocket(apiKey: string, intent: OpenAIRealtimeIntent): WebSocket {
  return new WebSocket(`wss://api.openai.com/v1/realtime?intent=${encodeURIComponent(intent)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

function normalizeCloseCode(code: number): number {
  return code >= 1000 && code <= 4999 ? code : 1011;
}

function hasProjectFeature(features: readonly string[] | undefined, feature: string): boolean {
  return !!features?.includes(feature);
}
