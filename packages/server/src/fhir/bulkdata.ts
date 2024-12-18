import { ContentType, flatMapFilter, isNotFound, OperationOutcomeError } from '@medplum/core';
import { AsyncJob, BulkDataExport } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { rewriteAttachments, RewriteMode } from './rewrite';
import { getAuthenticatedContext } from '../context';

// Bulk Data API
// https://hl7.org/fhir/uv/bulkdata/STU2/
// https://hl7.org/fhir/uv/bulkdata/STU2/OperationDefinition-group-export.html
// https://hl7.org/fhir/R4/async.html
// https://hl7.org/fhir/smart-app-launch/backend-services.html

export const bulkDataRouter = Router();

bulkDataRouter.get(
  '/export/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { id } = req.params;
    let bulkDataExport: AsyncJob | BulkDataExport;
    try {
      bulkDataExport = await ctx.repo.readResource<AsyncJob>('AsyncJob', id);
    } catch (err: unknown) {
      if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
        bulkDataExport = await ctx.repo.readResource<BulkDataExport>('BulkDataExport', id);
      } else {
        throw err;
      }
    }

    if (bulkDataExport.status !== 'completed') {
      res.status(202).end();
      return;
    }

    const json = await rewriteAttachments(RewriteMode.PRESIGNED_URL, ctx.repo, {
      transactionTime: bulkDataExport.transactionTime,
      request: bulkDataExport.request,
      requiresAccessToken: false, // Rewritten attachments use presigned S3 URLs and do not require the access token
      output: extractOutputParameters(bulkDataExport, 'output'),
      error: extractOutputParameters(bulkDataExport, 'error'),
      deleted: extractOutputParameters(bulkDataExport, 'deleted'),
    });
    res.status(200).type(ContentType.JSON).json(json);
  })
);

bulkDataRouter.delete('/export/:id', (req: Request, res: Response) => {
  res.sendStatus(202);
});

function extractOutputParameters(input: BulkDataExport | AsyncJob | undefined, name: string): unknown[] {
  if (input?.resourceType === 'BulkDataExport') {
    switch (name) {
      case 'output':
        return input.output ?? [];
      case 'error':
        return input.error ?? [];
      case 'deleted':
        return input.deleted ?? [];
      default:
        return [];
    }
  }

  return flatMapFilter(input?.output?.parameter, (param) => {
    if (param.name === name) {
      return {
        type: param.part?.find((part) => part.name === 'type')?.valueCode,
        url: param.part?.find((part) => part.name === 'url')?.valueUri,
      };
    } else {
      return undefined;
    }
  });
}
