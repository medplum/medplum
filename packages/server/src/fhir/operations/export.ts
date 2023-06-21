import { accepted, getResourceTypes, protectedResourceTypes, publicResourceTypes } from '@medplum/core';
import { Project, ResourceType } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { logger } from '../../logger';
import { Repository } from '../repo';
import { BulkExporter } from './utils/bulkexporter';

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
    .then(() => logger.info(`export for ${project.id} is completed`))
    .catch((err) => logger.error(`export for  ${project.id} failed: ${err}`));
  // Send the response
  res.set('Content-Location', `${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`).status(202).json(accepted);
}

export async function exportResources(
  exporter: BulkExporter,
  project: Project,
  types: string[] | undefined
): Promise<void> {
  const resourceTypes = getResourceTypes();

  for (const resourceType of resourceTypes) {
    if (!canBeExported(resourceType) || (types && !types.includes(resourceType))) {
      continue;
    }
    await exportResourceType(exporter, resourceType as ResourceType);
  }

  // Close the exporter
  await exporter.close(project);
}

export async function exportResourceType(
  exporter: BulkExporter,
  resourceType: ResourceType,
  maxResources = 1000
): Promise<void> {
  const repo = exporter.repo;
  let hasMore = true;
  let offset = 0;
  while (hasMore) {
    const bundle = await repo.search({
      resourceType,
      count: maxResources,
      offset,
    });
    if (!bundle.entry || bundle.entry.length === 0) {
      break;
    }

    for (const entry of bundle.entry) {
      if (entry.resource) {
        await exporter.writeResource(entry.resource);
      }
    }

    const linkNext = bundle.link?.find((b) => b.relation === 'next');
    hasMore = !!linkNext;
    offset += maxResources;
  }
}

function canBeExported(resourceType: string): boolean {
  if (resourceType === 'BulkDataExport') {
    return false;
  } else if (publicResourceTypes.includes(resourceType) || protectedResourceTypes.includes(resourceType)) {
    return false;
  }
  return true;
}
