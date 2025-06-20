import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { authenticateRequest } from '../oauth/middleware';
import { getMcpServer } from './server';

export const mcpRouter = Router().use(authenticateRequest);

// Model Context Protocol (MCP) routes
// Medplum supports 2 MCP transports:
// 1. Streamable HTTP - for newer clients that support streaming
// 2. Server-Sent Events (SSE) - for older clients that do not support streaming

const transports = {
  streamable: {} as Record<string, StreamableHTTPServerTransport>,
  sse: {} as Record<string, SSEServerTransport>,
};

async function handleStreamableHttpRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.streamable[sessionId]) {
    transport = transports.streamable[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.streamable[sessionId] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports.streamable[transport.sessionId];
      }
    };

    const server = getMcpServer();
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }
  await transport.handleRequest(req, res, req.body);
}

mcpRouter.get('/stream', asyncWrap(handleStreamableHttpRequest));
mcpRouter.post('/stream', asyncWrap(handleStreamableHttpRequest));
mcpRouter.delete('/stream', asyncWrap(handleStreamableHttpRequest));

// Legacy SSE endpoint for older clients
mcpRouter.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/mcp/sse', res);
  transports.sse[transport.sessionId] = transport;

  res.on('close', () => {
    delete transports.sse[transport.sessionId];
  });

  const server = getMcpServer();
  await server.connect(transport);
});

// Legacy message endpoint for older clients
mcpRouter.post('/sse', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.sse[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});
