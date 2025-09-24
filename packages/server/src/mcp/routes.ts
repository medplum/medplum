// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response, Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import { IncomingMessage } from 'http';
import { asyncWrap } from '../async';
import { heartbeat } from '../heartbeat';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { getRedis, getRedisSubscriber } from '../redis';
import { getMcpServer } from './server';

export const mcpRouter = Router().use(authenticateRequest);

// MCP Streamable HTTP endpoint (/mcp/stream)
// Handles all HTTP methods (GET, POST, etc.)
mcpRouter.all(
  '/stream',
  asyncWrap(async (req: Request, res: Response) => {
    const server = getMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', async () => {
      await transport.close();
      await server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  })
);

// MCP SSE GET endpoint (/mcp/sse)
// This endpoint uses Server-Sent Events (SSE) to stream messages to the client
// MCP SSE is technically deprecated, but most major LLM clients still use it
mcpRouter.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/mcp/sse', res);

  const redisSubscriber = getRedisSubscriber();
  redisSubscriber.on('message', async (_channel: string, data: string) => {
    try {
      const dummyReq = { headers: { 'content-type': 'application/json' } } as IncomingMessage;
      const dummyRes = {
        writeHead: (_statusCode: number, _headers?: Record<string, string>) => dummyRes,
        end: (_data?: string) => {},
      } as unknown as Response;
      await transport.handlePostMessage(dummyReq, dummyRes, data);
    } catch (err: any) {
      getLogger().error('Error handling MCP SSE message', err);
    }
  });
  await redisSubscriber.subscribe(getRedisChannelForSessionId(transport.sessionId));

  const server = getMcpServer();
  await server.connect(transport);

  const heartbeatHandler = async (): Promise<unknown> => server.server.ping();
  heartbeat.addEventListener('heartbeat', heartbeatHandler);

  res.on('close', async () => {
    heartbeat.removeEventListener('heartbeat', heartbeatHandler);
    redisSubscriber.disconnect();
    await transport.close();
    await server.close();
  });
});

// MCP SSE POST endpoint
// This endpoint allows clients to send messages to the server using Server-Sent Events
mcpRouter.post(
  '/sse',
  query('sessionId').isUUID().withMessage('Invalid sessionId'),
  body('jsonrpc').isString().withMessage('Invalid JSON-RPC body'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).send({ errors: errors.array() });
      return;
    }
    const sessionId = req.query?.sessionId as string;
    const body = req.body;
    await getRedis().publish(getRedisChannelForSessionId(sessionId), JSON.stringify(body));
    res.status(202).end('Accepted');
  }
);

function getRedisChannelForSessionId(sessionId: string): string {
  return `medplum:mcp:sse:${sessionId}`;
}
