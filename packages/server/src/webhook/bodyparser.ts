// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Options } from 'body-parser';
import { raw } from 'body-parser';
import type { RequestHandler } from 'express';
import { MIMEType } from 'node:util';

export const WEBHOOK_PATHS = [
  '/webhook/:id',
  '/api/webhook/:id',
  '/projects/:projectId/webhook/:id',
  '/api/projects/:projectId/webhook/:id',
];

/**
 * Captures public webhook UTF-8 JSON for parsing in the webhook handler.
 * @param options - The same content types and size limit used by the normal JSON parser.
 * @returns Raw middleware for the public webhook routes.
 */
export function createWebhookRawParser(options: Pick<Options, 'type' | 'limit'>): RequestHandler {
  const parser = raw(options);
  return (req, res, next) => {
    let charset: string | undefined;
    try {
      charset = new MIMEType(req.headers['content-type'] ?? '').params.get('charset')?.toLowerCase();
    } catch {
      // Leave unsupported content types to the existing parsers.
      next();
      return;
    }
    if (charset && charset !== 'utf-8') {
      next();
      return;
    }
    parser(req, res, next);
  };
}

/**
 * Parses captured JSON while preserving its original text for signature verification.
 * @param body - The request body from the raw or existing non-UTF-8/non-JSON parser.
 * @returns Parsed input and, for captured JSON, the original text.
 */
export function parseWebhookBody(body: any): { input: any; rawBody?: string } {
  if (!Buffer.isBuffer(body)) {
    return { input: body };
  }
  const rawBody = body.toString('utf8');
  // Match the JSON parser's BOM stripping, empty-body handling, and strict object/array validation.
  const text = rawBody.replace(/^\uFEFF/, '');
  if (text.length === 0) {
    return { input: {}, rawBody };
  }
  try {
    if (!/^[ \t\r\n]*[{[]/.test(text)) {
      throw new Error('Expected a JSON object or array');
    }
    return { input: JSON.parse(text), rawBody };
  } catch {
    throw new OperationOutcomeError(badRequest('Content could not be parsed'));
  }
}
