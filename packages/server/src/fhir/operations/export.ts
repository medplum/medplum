import { accepted, concatUrls, getResourceTypes, protectedResourceTypes } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Project, ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config';
import { getAuthenticatedContext } from '../../context';
import { getPatientResourceTypes } from '../patient';
import { BulkExporter } from './utils/bulkexporter';

/**
 * Handles a bulk export request.
 *
 * Endpoint
 *   [fhir base]/$export
 *
 * See: https://hl7.org/fhir/uv/bulkdata/export.html
 * See: https://hl7.org/fhir/R4/async.html
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function bulkExportHandler(req: FhirRequest): Promise<FhirResponse> {
  return startExport(req, 'System');
}

/**
 * Handles a Patient export request.
 *
 * Endpoint
 *   [fhir base]/Patient/$export
 *
 * See: https://hl7.org/fhir/uv/bulkdata/export.html#endpoint---all-patients
 * See: https://hl7.org/fhir/R4/async.html
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function patientExportHandler(req: FhirRequest): Promise<FhirResponse> {
  return startExport(req, 'Patient');
}

async function startExport(req: FhirRequest, exportType: string): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { baseUrl } = getConfig();
  const since = req.query._since;
  const types = req.query._type?.split(',');

  const exporter = new BulkExporter(ctx.repo, since);
  const bulkDataExport = await exporter.start(concatUrls(baseUrl, 'fhir/R4' + req.pathname));

  exportResources(exporter, ctx.project, types, exportType)
    .then(() => ctx.logger.info('Export completed', { exportType, id: ctx.project.id }))
    .catch((err) => ctx.logger.error('Export failure', { exportType, id: ctx.project.id, error: err }));

  return [accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`)];
}

export async function exportResources(
  exporter: BulkExporter,
  project: Project,
  types: string[] | undefined,
  exportLevel: string
): Promise<void> {
  const resourceTypes = getResourceTypesByExportLevel(exportLevel);

  for (const resourceType of resourceTypes) {
    if (
      !canBeExported(resourceType) ||
      (types && !types.includes(resourceType)) ||
      !exporter.repo.canReadResourceType(resourceType)
    ) {
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

const unexportedResourceTypes = [
  'Binary',
  'CodeSystem',
  'SearchParameter',
  'StructureDefinition',
  'ValueSet',
  'BulkDataExport',
];

function canBeExported(resourceType: string): boolean {
  return !unexportedResourceTypes.includes(resourceType) && !protectedResourceTypes.includes(resourceType);
}
