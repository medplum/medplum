// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, concatUrls, getStatus, isCreated } from '@medplum/core';
import { FhirResponseOptions } from '@medplum/fhir-router';
import { Binary, OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { getBinaryStorage } from '../storage/loader';
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

export async function sendBinaryResponse(res: Response, binaryResource: Binary): Promise<void> {
  res.contentType(binaryResource.contentType as string);
  if (binaryResource.data) {
    res.send(Buffer.from(binaryResource.data, 'base64'));
  } else {
    const stream = await getBinaryStorage().readBinary(binaryResource);
    stream.pipe(res);
  }
}

export async function sendFhirResponse(
  req: Request,
  res: Response,
  outcome: OperationOutcome,
  body: Resource,
  options?: FhirResponseOptions
): Promise<void> {
  sendResponseHeaders(req, res, outcome, body);

  if (
    body.resourceType === 'Binary' &&
    ((req.method === 'GET' && !req.get('Accept')?.startsWith(ContentType.FHIR_JSON)) || options?.forceRawBinaryResponse)
  ) {
    // When the read request has some other type in the Accept header,
    // then the content should be returned with the content type stated in the resource in the Content-Type header.
    // E.g. if the content type in the resource is "application/pdf", then the content should be returned as a PDF directly.
    await sendBinaryResponse(res, body as Binary);
    return;
  }

  const ctx = getAuthenticatedContext();
  const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, ctx.repo, body);

  res.set('Content-Type', options?.contentType ?? ContentType.FHIR_JSON);
  res.json(result);
}
