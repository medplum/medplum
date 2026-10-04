// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import {
  accepted,
  AccessPolicyInteraction,
  concatUrls,
  getResourceTypes,
  Operator,
  protectedResourceTypes,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getPatientResourceTypes } from '../patient';
import { BulkExporter } from './utils/bulkexporter';
import { parseExportParameters, parseExportTypeFilters } from './utils/export';

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
  const { types, since, typeFilters } = parseExportParameters(req);
  const searches = parseExportTypeFilters(ctx.repo, typeFilters);

  const exporter = new BulkExporter(ctx.repo);
  const bulkDataExport = await exporter.start(concatUrls(baseUrl, 'fhir/R4' + req.pathname));

  exportResources(exporter, ctx.project, types, exportType, since, searches)
    .then(() => ctx.logger.info('Export completed', { exportType, id: ctx.project.id }))
    .catch((err) => ctx.logger.error('Export failure', { exportType, id: ctx.project.id, error: err }));

  return [accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`)];
}

export async function exportResources(
  exporter: BulkExporter,
  project: Project,
  types: string[] | undefined,
  exportLevel: string,
  since?: string,
  typeFilters: SearchRequest[] = []
): Promise<void> {
  const resourceTypes = getResourceTypesByExportLevel(exportLevel);
  const pageSize = 1000;

  for (const resourceType of resourceTypes) {
    if (
      !canBeExported(resourceType) ||
      (types && !types.includes(resourceType)) ||
      !exporter.repo.supportsInteraction(AccessPolicyInteraction.SEARCH, resourceType)
    ) {
      continue;
    }
    await exportResourceType(
      exporter,
      resourceType,
      pageSize,
      since,
      typeFilters.filter((search) => search.resourceType === resourceType)
    );
  }

  // Close the exporter
  await exporter.close(project);
}

export async function exportResourceType<T extends Resource>(
  exporter: BulkExporter,
  resourceType: T['resourceType'],
  count: number,
  since?: string,
  typeFilters: SearchRequest[] = []
): Promise<void> {
  const repo = exporter.repo;
  const searchRequest: SearchRequest<T> | undefined = {
    resourceType,
    count,
    filters: since ? [{ code: '_lastUpdated', operator: Operator.GREATER_THAN_OR_EQUALS, value: since }] : undefined,
    sortRules: [{ code: '_lastUpdated', descending: false }],
  };
  // Each query is an alternative (OR). Dedupe overlapping matches across alternatives.
  for (const search of typeFilters.length ? typeFilters : [{ resourceType }]) {
    await repo.processAllResources(
      {
        ...searchRequest,
        filters: [...(searchRequest.filters ?? []), ...(search.filters ?? [])],
      },
      async (resource) => {
        await exporter.writeResource(resource, { skipDedupe: typeFilters.length <= 1 });
      }
    );
  }

  // Close writer and free memory for this resource type immediately
  await exporter.closeWriter(resourceType);
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
  'AsyncJob',
  'AuditEvent',
];

function canBeExported(resourceType: string): boolean {
  return !unexportedResourceTypes.includes(resourceType) && !protectedResourceTypes.includes(resourceType);
}
