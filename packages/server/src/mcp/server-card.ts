// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { concatUrls } from '@medplum/core';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
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
 * Sends a cacheable discovery document with an ETag, answering If-None-Match with 304.
 * The app disables Express's automatic ETags, so this computes one.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 * @param contentType - The document media type.
 * @param document - The document.
 */
function sendDiscoveryDocument(req: Request, res: Response, contentType: string, document: object): void {
  const body = JSON.stringify(document);
  const etag = `W/"${createHash('sha256').update(body).digest('base64url')}"`;
  res.set({ 'Cache-Control': 'public, max-age=3600', ETag: etag });
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.type(contentType).send(body);
}

export function serverCardHandler(req: Request, res: Response): void {
  const { title, version, websiteUrl, icons } = MCP_SERVER_INFO;
  sendDiscoveryDocument(req, res, SERVER_CARD_CONTENT_TYPE, {
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
  });
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
  sendDiscoveryDocument(req, res, AI_CATALOG_CONTENT_TYPE, { specVersion: '1.0', entries });
}
