import { Request, Response } from 'express';
import { Repository, protectedResourceTypes, publicResourceTypes, systemRepo } from '../repo';
import { BulkDataExport, Project, ResourceType } from '@medplum/fhirtypes';
import { BulkExporter } from './utils/bulkexporter';
import { getReferenceString, getResourceTypes } from '@medplum/core';
import { getConfig } from '../../config';
import { randomUUID } from 'crypto';

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
  const repo = res.locals.repo as Repository;
  const project = res.locals.project as Project;

  // Create the BulkDataExport
  const bulkDataExport = await repo.createResource<BulkDataExport>({
    resourceType: 'BulkDataExport',
    status: 'active',
    request: req.protocol + '://' + req.get('host') + req.originalUrl,
    requestTime: new Date().toISOString(),
  });
  const exporter = new BulkExporter(repo, undefined);

  const resourceTypes = getResourceTypes();

  for (const resourceType of resourceTypes) {
    if (!canBeExported(resourceType)) {
      continue;
    }
    await exportResourceType(exporter, project, resourceType as ResourceType);
  }

  // Close the exporter
  await exporter.close();

  // Update the BulkDataExport
  await systemRepo.updateResource<BulkDataExport>({
    ...bulkDataExport,
    meta: {
      project: (res.locals.project as Project).id,
    },
    status: 'completed',
    transactionTime: new Date().toISOString(),
    output: Object.entries(exporter.writers).map(([resourceType, writer]) => ({
      type: resourceType as ResourceType,
      url: getReferenceString(writer.binary),
    })),
  });

  // Send the response
  res
    .set('Content-Location', `${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`)
    .status(202)
    .json({
      resourceType: 'OperationOutcome',
      id: randomUUID(),
      issue: [
        {
          severity: 'information',
          code: 'informational',
          details: {
            text: 'Accepted',
          },
        },
      ],
    });
}

async function exportResourceType(exporter: BulkExporter, project: Project, resourceType: ResourceType): Promise<void> {
  const repo = exporter.repo;
  while (true) {
    const bundle = await repo.search({
      resourceType,
      count: 1000,
    });
    if (!bundle.entry || bundle.entry.length === 0) {
      break;
    }

    let writes = [];
    for (const entry of bundle.entry) {
      if (entry.resource?.id) {
        writes.push(exporter.writeResource(entry.resource));
      }
    }
    await Promise.all(writes);

    const linkNext = bundle.link?.find((b) => b.relation === 'next');
    if (!linkNext?.url) {
      break
    }
  }
}

function canBeExported(resourceType: string) {
  if (resourceType == 'BulkDataExport') {
    return false;
  } else if (publicResourceTypes.includes(resourceType) || protectedResourceTypes.includes(resourceType)) {
    return false;
  }
  return true;
}