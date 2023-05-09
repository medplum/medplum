import { Request, Response } from 'express';
import { Repository, protectedResourceTypes, publicResourceTypes } from '../repo';
import { Project, ResourceType } from '@medplum/fhirtypes';
import { BulkExporter } from './utils/bulkexporter';
import { getResourceTypes, accepted } from '@medplum/core';
import { getConfig } from '../../config';

/**
 * Handles a bulk export request.
 *
 * Endpoint
 *   [fhir base]/$export
 *
 * See: https://hl7.org/fhir/uv/bulkdata/export.html
 * See: https://hl7.org/fhir/R4/async.html
 *
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
  await exporter.start(req.protocol + '://' + req.get('host') + req.originalUrl);

  const resourceTypes = getResourceTypes();

  for (const resourceType of resourceTypes) {
    if (!canBeExported(resourceType) || (types && !types.includes(resourceType))) {
      continue;
    }
    await exportResourceType(exporter, project, resourceType as ResourceType);
  }

  // Close the exporter
  const bulkDataExport = await exporter.close(project);

  // Send the response
  res.set('Content-Location', `${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`).status(202).json(accepted);
}

async function exportResourceType(exporter: BulkExporter, project: Project, resourceType: ResourceType): Promise<void> {
  const repo = exporter.repo;
  const hasMore = true;
  while (hasMore) {
    const bundle = await repo.search({
      resourceType,
      count: 1000,
    });
    if (!bundle.entry || bundle.entry.length === 0) {
      break;
    }

    const writes = [];
    for (const entry of bundle.entry) {
      if (entry.resource?.id) {
        const writer = await exporter.getWriter(resourceType);

        writes.push(exporter.writeResource(entry.resource, writer));
      }
    }
    await Promise.all(writes);

    const linkNext = bundle.link?.find((b) => b.relation === 'next');
    if (!linkNext?.url) {
      break;
    }
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
