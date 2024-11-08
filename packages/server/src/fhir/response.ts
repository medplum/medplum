import { ContentType, concatUrls, getStatus, isCreated } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../config';
import { getAuthenticatedContext } from '../context';
import { RewriteMode, rewriteAttachments } from './rewrite';
import { getBinaryStorage } from './storage';
import { FhirResponseOptions } from '@medplum/fhir-router';

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

export async function sendFhirResponse(
  req: Request,
  res: Response,
  outcome: OperationOutcome,
  body: Resource,
  options?: FhirResponseOptions
): Promise<void> {
  sendResponseHeaders(req, res, outcome, body);

  if (body.resourceType === 'Binary' && req.method === 'GET' && !req.get('Accept')?.startsWith(ContentType.FHIR_JSON)) {
    // When the read request has some other type in the Accept header,
    // then the content should be returned with the content type stated in the resource in the Content-Type header.
    // E.g. if the content type in the resource is "application/pdf", then the content should be returned as a PDF directly.
    res.contentType(body.contentType as string);
    if (body.data) {
      res.send(Buffer.from(body.data, 'base64'));
    } else {
      const stream = await getBinaryStorage().readBinary(body);
      stream.pipe(res);
    }
    return;
  }

  const ctx = getAuthenticatedContext();
  const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, ctx.repo, body);

  res.set('Content-Type', options?.contentType ?? ContentType.FHIR_JSON);
  res.json(result);
}
