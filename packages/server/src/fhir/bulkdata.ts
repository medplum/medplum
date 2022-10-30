import { BulkDataExport } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { Repository } from './repo';
import { rewriteAttachments, RewriteMode } from './rewrite';

// Bulk Data API
// https://hl7.org/fhir/uv/bulkdata/STU2/
// https://hl7.org/fhir/uv/bulkdata/STU2/OperationDefinition-group-export.html
// https://hl7.org/fhir/R4/async.html
// https://hl7.org/fhir/smart-app-launch/backend-services.html

export const bulkDataRouter = Router();

bulkDataRouter.get(
  '/export/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    const repo = res.locals.repo as Repository;
    const bulkDataExport = await repo.readResource<BulkDataExport>('BulkDataExport', id);
    const json = await rewriteAttachments(RewriteMode.PRESIGNED_URL, repo, {
      transactionTime: bulkDataExport.transactionTime,
      request: bulkDataExport.request,
      requiresAccessToken: !!bulkDataExport.requiresAccessToken,
      output: bulkDataExport.output || [],
      error: bulkDataExport.error || [],
    });
    res.status(200).type('application/json').json(json);
  })
);

bulkDataRouter.delete('/export/:id', (req: Request, res: Response) => {
  res.sendStatus(202);
});
