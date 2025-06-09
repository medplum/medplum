import { getStatus, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
  try {
    const server = getMcpServer();
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', async () => {
      await transport.close();
      await server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      const outcome = normalizeOperationOutcome(err);
      res.status(getStatus(outcome)).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: normalizeErrorString(err),
        },
        id: null,
      });
    }
  }
}

mcpRouter.get('/', asyncWrap(handleStreamableHttpRequest));
mcpRouter.post('/', asyncWrap(handleStreamableHttpRequest));
mcpRouter.delete('/', asyncWrap(handleStreamableHttpRequest));

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
