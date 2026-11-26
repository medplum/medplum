// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { concatUrls } from '@medplum/core';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import type { NextFunction, Request, Response } from 'express';
import { getConfig } from '../config/loader';
import { getProjectScopedUrl } from '../util/url';
import { MCP_SERVER_INFO } from './server';

// MCP Server Card and AI Catalog discovery documents
// See: https://modelcontextprotocol.io/seps/2127-mcp-server-cards

export const SERVER_CARD_CONTENT_TYPE = 'application/mcp-server-card+json';
const AI_CATALOG_CONTENT_TYPE = 'application/ai-catalog+json';
const SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';

function getStreamUrl(req: Request): string {
  const { baseUrl } = getConfig();
  return getProjectScopedUrl(req.originalUrl, baseUrl, concatUrls(baseUrl, 'mcp/stream'));
}

/**
 * Sets the CORS and caching headers that the Server Card spec requires for public discovery documents.
 * Answers preflight requests directly.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 * @param next - The next handler.
 */
export function discoveryHeaders(req: Request, res: Response, next: NextFunction): void {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Cache-Control': 'public, max-age=3600',
  });
  // The global CORS middleware may have allowed credentials, which browsers reject with a wildcard origin
  res.removeHeader('Access-Control-Allow-Credentials');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function serverCardHandler(req: Request, res: Response): void {
  const { title, version, websiteUrl, icons } = MCP_SERVER_INFO;
  res.type(SERVER_CARD_CONTENT_TYPE).send(
    JSON.stringify({
      $schema: SERVER_CARD_SCHEMA,
      name: 'com.medplum/mcp',
      title,
      version,
      description: 'Read, search, create, update, and delete FHIR R4 resources as the signed-in user.',
      websiteUrl,
      icons,
      repository: { url: 'https://github.com/medplum/medplum', source: 'github', subfolder: 'packages/server' },
      remotes: [
        { type: 'streamable-http', url: getStreamUrl(req), supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS },
      ],
    })
  );
}

export function aiCatalogHandler(req: Request, res: Response): void {
  const { baseUrl, mcpEnabled } = getConfig();
  const entries = mcpEnabled
    ? [
        {
          identifier: `urn:air:${new URL(baseUrl).hostname}:mcp:medplum`,
          type: SERVER_CARD_CONTENT_TYPE,
          url: concatUrls(getStreamUrl(req), 'server-card'),
        },
      ]
    : [];
  res.type(AI_CATALOG_CONTENT_TYPE).send(JSON.stringify({ specVersion: '1.0', entries }));
}
