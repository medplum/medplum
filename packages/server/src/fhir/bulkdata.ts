// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, flatMapFilter, isNotFound, notFound, OperationOutcomeError } from '@medplum/core';
import { AsyncJob, BulkDataExport } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { getAuthenticatedContext } from '../context';
import { rewriteAttachments, RewriteMode } from './rewrite';

// Bulk Data API
// https://hl7.org/fhir/uv/bulkdata/STU2/
// https://hl7.org/fhir/uv/bulkdata/STU2/OperationDefinition-group-export.html
// https://hl7.org/fhir/R4/async.html
// https://hl7.org/fhir/smart-app-launch/backend-services.html

export const bulkDataRouter = Router();

async function getExportResource(id: string): Promise<AsyncJob | BulkDataExport> {
  const { repo } = getAuthenticatedContext();
  let resource: AsyncJob | BulkDataExport;
  try {
    resource = await repo.readResource<AsyncJob>('AsyncJob', id);
  } catch (err: unknown) {
    if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
      resource = await repo.readResource<BulkDataExport>('BulkDataExport', id);
    } else {
      throw err;
    }
  }

  return resource;
}

bulkDataRouter.get(
  '/export/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { id } = req.params;
    const bulkDataExport = await getExportResource(id);

    if (bulkDataExport.status === 'cancelled') {
      res.status(404).json(notFound);
      return;
    } else if (bulkDataExport.status !== 'completed') {
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

bulkDataRouter.delete('/export/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const bulkDataExport = await getExportResource(id);

  if (bulkDataExport.status !== 'cancelled') {
    bulkDataExport.status = 'cancelled';
    const { repo } = getAuthenticatedContext();
    await repo.updateResource(bulkDataExport);
  }

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
