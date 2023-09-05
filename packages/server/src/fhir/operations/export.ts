import { accepted, getResourceTypes, protectedResourceTypes, publicResourceTypes } from '@medplum/core';
import { Project, ResourceType } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { sendOutcome } from '../outcomes';
import { getPatientResourceTypes } from '../patient';
import { BulkExporter } from './utils/bulkexporter';
import { getRequestContext } from '../../app';

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
  await startExport(req, res, 'System');
}

/**
 * Handles a Patient export request.
 *
 * Endpoint
 *   [fhir base]/Patient/$export
 *
 * See: https://hl7.org/fhir/uv/bulkdata/export.html#endpoint---all-patients
 * See: https://hl7.org/fhir/R4/async.html
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function patientExportHandler(req: Request, res: Response): Promise<void> {
  await startExport(req, res, 'Patient');
}

async function startExport(req: Request, res: Response, exportType: string): Promise<void> {
  const ctx = getRequestContext();
  const { baseUrl } = getConfig();
  const query = req.query as Record<string, string | undefined>;
  const since = query._since;
  const types = query._type?.split(',');

  const exporter = new BulkExporter(ctx.repo, since);
  const bulkDataExport = await exporter.start(req.protocol + '://' + req.get('host') + req.originalUrl);

  exportResources(exporter, ctx.project, types, exportType)
    .then(() => ctx.logger.info('Export completed', { exportType, id: ctx.project.id }))
    .catch((err) => ctx.logger.error('Export failure', { exportType, id: ctx.project.id, error: err }));

  sendOutcome(res, accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`));
}

export async function exportResources(
  exporter: BulkExporter,
  project: Project,
  types: string[] | undefined,
  exportLevel: string
): Promise<void> {
  const resourceTypes = getResourceTypesByExportLevel(exportLevel);

  for (const resourceType of resourceTypes) {
    if (!canBeExported(resourceType) || (types && !types.includes(resourceType))) {
      continue;
    }
    await exportResourceType(exporter, resourceType);
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

function getResourceTypesByExportLevel(exportLevel: string): ResourceType[] {
  if (exportLevel === 'Patient') {
    return getPatientResourceTypes();
  }

  return getResourceTypes();
}

function canBeExported(resourceType: string): boolean {
  if (resourceType === 'BulkDataExport') {
    return false;
  }

  if (publicResourceTypes.includes(resourceType) || protectedResourceTypes.includes(resourceType)) {
    return false;
  }
  return true;
}
