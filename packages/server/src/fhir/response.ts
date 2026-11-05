// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, concatUrls, getStatus, isCreated, notFound } from '@medplum/core';
import type { FhirResponseOptions } from '@medplum/fhir-router';
import type { Binary, OperationOutcome, Resource } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { getConfig } from '../config/loader';
import { AuthenticatedRequestContext, tryGetRequestContext } from '../context';
import { getLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import { sendOutcome } from './outcomes';
import { RewriteMode, rewriteAttachments } from './rewrite';

export function isFhirJsonContentType(req: Request): boolean {
  return !!(req.is(ContentType.JSON) || req.is(ContentType.FHIR_JSON));
}

export function getFullUrl(resourceType: string, id: string): string {
  return concatUrls(getConfig().baseUrl, `/fhir/R4/${resourceType}/${id}`);
}

export function sendResponseHeaders(_req: Request, res: Response, outcome: OperationOutcome, body: Resource): void {
  if (body.meta?.versionId) {
    res.set('ETag', `W/"${body.meta.versionId}"`);
  }
  if (body.meta?.lastUpdated) {
    res.set('Last-Modified', new Date(body.meta.lastUpdated).toUTCString());
  }
  if (isCreated(outcome)) {
    res.set('Location', getFullUrl(body.resourceType, body.id as string));
  }

  res.status(getStatus(outcome));
}

export async function sendBinaryResponse(
  req: Request,
  res: Response,
  outcome: OperationOutcome,
  binaryResource: Binary
): Promise<void> {
  try {
    if (binaryResource.data) {
      sendResponseHeaders(req, res, outcome, binaryResource);
      res.contentType(binaryResource.contentType);
      res.send(Buffer.from(binaryResource.data, 'base64'));
      return;
    }

    const stream = await getBinaryStorage().readBinary(binaryResource);
    sendResponseHeaders(req, res, outcome, binaryResource);
    res.contentType(binaryResource.contentType);
    await pipeline(stream, res);
  } catch (err) {
    getLogger().error('Error reading Binary content', {
      err,
      binary: binaryResource.id ? `Binary/${binaryResource.id}` : undefined,
      versionId: binaryResource.meta?.versionId,
    });
    if (!res.headersSent) {
      res.removeHeader('ETag');
      res.removeHeader('Last-Modified');
      res.removeHeader('Content-Type');
      sendOutcome(res, notFound);
      return;
    }
    throw err;
  }
}

export async function sendFhirResponse(
  req: Request,
  res: Response,
  outcome: OperationOutcome,
  body: Resource,
  options?: FhirResponseOptions
): Promise<void> {
  if (
    body.resourceType === 'Binary' &&
    ((req.method === 'GET' && !req.get('Accept')?.startsWith(ContentType.FHIR_JSON)) || options?.forceRawBinaryResponse)
  ) {
    // When the read request has some other type in the Accept header,
    // then the content should be returned with the content type stated in the resource in the Content-Type header.
    // E.g. if the content type in the resource is "application/pdf", then the content should be returned as a PDF directly.
    await sendBinaryResponse(req, res, outcome, body);
    return;
  }

  sendResponseHeaders(req, res, outcome, body);

  let result = body;

  const ctx = tryGetRequestContext();
  if (ctx instanceof AuthenticatedRequestContext) {
    result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, ctx.repo, body);
  }

  res.set('Content-Type', options?.contentType ?? ContentType.FHIR_JSON);
  res.json(result);
}
