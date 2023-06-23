import { accepted } from '@medplum/core';
import { Project } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { BulkExporter, exportResources } from './utils/bulkexporter';

/**
 * Handles a bulk export request.
 *
 * Endpoint
 *   [fhir base]/$export
 *
 * See: https://hl7.org/fhir/uv/bulkdata/export.html
 * See: https://hl7.org/fhir/R4/async.html
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function bulkExportHandler(req: Request, res: Response): Promise<void> {
  const { baseUrl } = getConfig();
  const query = req.query as Record<string, string | undefined>;
  const since = query._since;
  const types = query._type?.split(',');
  const repo = res.locals.repo as Repository;
  const project = res.locals.project as Project;

  const exporter = new BulkExporter(repo, since);
  const bulkDataExport = await exporter.start(req.protocol + '://' + req.get('host') + req.originalUrl);

  exportResources(exporter, project, types)
    .then(() => logger.info(`System level export for ${project.id} is completed`))
    .catch((err) => logger.error(`System level export for  ${project.id} failed: ${err}`));

  sendOutcome(res, accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`));
}
