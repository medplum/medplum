import { ContentType, getStatus, isCreated } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../config';
import { getAuthenticatedContext } from '../context';
import { RewriteMode, rewriteAttachments } from './rewrite';

export function isFhirJsonContentType(req: Request): boolean {
  return !!(req.is(ContentType.JSON) || req.is(ContentType.FHIR_JSON));
}

export function getFullUrl(resourceType: string, id: string): string {
  return `${getConfig().baseUrl}fhir/R4/${resourceType}/${id}`;
}

export async function sendResponse(res: Response, outcome: OperationOutcome, body: Resource): Promise<void> {
  const ctx = getAuthenticatedContext();
  if (body.meta?.versionId) {
    res.set('ETag', `W/"${body.meta.versionId}"`);
  }
  if (body.meta?.lastUpdated) {
    res.set('Last-Modified', new Date(body.meta.lastUpdated).toUTCString());
  }
  if (isCreated(outcome)) {
    res.set('Location', getFullUrl(body.resourceType, body.id as string));
  }
  res.status(getStatus(outcome)).json(await rewriteAttachments(RewriteMode.PRESIGNED_URL, ctx.repo, body));
}
