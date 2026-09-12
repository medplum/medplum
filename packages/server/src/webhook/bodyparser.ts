// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OptionsJson } from 'body-parser';
import { json } from 'body-parser';
import type { RequestHandler, Response } from 'express';

export const WEBHOOK_PATHS = [
  '/webhook/:id',
  '/api/webhook/:id',
  '/projects/:projectId/webhook/:id',
  '/api/projects/:projectId/webhook/:id',
];

/**
 * Parses public webhook JSON while retaining the original UTF-8 text for signature verification.
 * @param options - The same content types and size limit used by the normal JSON parser.
 * @returns JSON middleware for the public webhook routes.
 */
export function createWebhookJsonParser(options: Pick<OptionsJson, 'type' | 'limit'>): RequestHandler {
  return json({
    ...options,
    verify: (_req, res, buffer, encoding) => {
      if (encoding === 'utf-8') {
        (res as Response).locals.webhookRawBody = buffer.toString('utf8');
      }
    },
  });
}
