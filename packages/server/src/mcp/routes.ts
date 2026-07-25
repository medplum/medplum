// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { authenticateRequest } from '../oauth/middleware';
import { getMcpServer } from './server';

export const mcpRouter = Router().use(authenticateRequest);

// MCP Streamable HTTP endpoint (/mcp/stream)
// Handles all HTTP methods (GET, POST, etc.)
mcpRouter.all('/stream', async (req: Request, res: Response) => {
  await getMcpServer().handleRequest(req, res);
});

// MCP SSE endpoint (/mcp/sse)
// The deprecated SSE transport has been removed in favor of Streamable HTTP.
// Answered with 410 Gone rather than 404 so that clients get actionable guidance.
mcpRouter.all('/sse', (_req: Request, res: Response) => {
  res.status(410).type(ContentType.JSON).send({
    error: 'gone',
    message: 'The MCP SSE transport has been removed. Use the Streamable HTTP transport at /mcp/stream instead.',
  });
});
