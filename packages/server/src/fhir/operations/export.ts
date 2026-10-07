// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  accepted,
  AccessPolicyInteraction,
  arrayify,
  badRequest,
  concatUrls,
  getResourceTypes,
  isString,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  protectedResourceTypes,
  singularize,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getPatientCompartmentParams, getPatientResourceTypes } from '../patient';
import type { Repository } from '../repo';
import { getSelectQueryForSearch } from '../search';
import { makeOperationDefinition } from './definitions';
import { BulkExporter } from './utils/bulkexporter';
import { parseInputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'export',
    code: 'export',
    parameter: [
      { use: 'in', name: '_since', type: 'instant', min: 0, max: '1' },
      { use: 'in', name: '_type', type: 'string', min: 0, max: '*' },
      { use: 'in', name: '_typeFilter', type: 'string', min: 0, max: '*' },
    ],
  }
);

interface ExportInput {
  _since?: string;
  _type?: string | string[];
  _typeFilter?: string | string[];
}

export interface ExportParameters {
  since?: string;
  types?: string[];
  typeFilters?: string[];
}

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
  const { since, types, typeFilters } = parseExportParameters(req);
  const typeFilterSearches = parseTypeFilters(ctx.repo, typeFilters);

  const exporter = new BulkExporter(ctx.repo);
  const bulkDataExport = await exporter.start(concatUrls(baseUrl, 'fhir/R4' + req.pathname));

  exportResources(exporter, ctx.project, types, exportType, since, typeFilterSearches)
    .then(() => ctx.logger.info('Export completed', { exportType, id: ctx.project.id }))
    .catch((err) => ctx.logger.error('Export failure', { exportType, id: ctx.project.id, error: err }));

  return [accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`)];
}

/**
 * Parses bulk export parameters from the query string and, for POST requests, a Parameters body.
 * Body values take precedence over query string values for each parameter.
 * @param req - The FHIR request.
 * @returns The parsed export parameters.
 */
export function parseExportParameters(req: FhirRequest): ExportParameters {
  const body = req.method === 'POST' ? parseInputParameters<ExportInput>(operation, req) : {};
  // parseInputParameters returns [] for an omitted repeating parameter
  const types = body._type?.length ? arrayify(body._type) : arrayify(req.query._type);
  const typeFilters = body._typeFilter?.length ? arrayify(body._typeFilter) : arrayify(req.query._typeFilter);
  // A non-string value[x] in the body parses as undefined
  if ((types && !types.every(isString)) || (typeFilters && !typeFilters.every(isString))) {
    throw new OperationOutcomeError(
      badRequest('_type and _typeFilter values must be strings', ['_type', '_typeFilter'])
    );
  }
  return {
    since: body._since ?? singularize(req.query._since),
    // The IG requires repeated _type parameters, but comma-delimited values are kept for compatibility
    types: types?.flatMap((type) => type.split(',')),
    typeFilters,
  };
}

/**
 * The Bulk Data IG recommends rejecting unsupported _typeFilter requests rather than exporting unfiltered data.
 * @param typeFilters - The requested _typeFilter values.
 */
export function assertNoTypeFilters(typeFilters: string[] | undefined): void {
  if (typeFilters?.length) {
    throw new OperationOutcomeError(badRequest('_typeFilter is not supported', '_typeFilter'));
  }
}

/**
 * Parses and validates _typeFilter values before an export job starts.
 * @param repo - The repository used to validate each search.
 * @param typeFilters - The requested _typeFilter values.
 * @returns One search request per _typeFilter value.
 */
function parseTypeFilters(repo: Repository, typeFilters: string[] | undefined): SearchRequest[] | undefined {
  return typeFilters?.map((typeFilter) => {
    // parseSearchRequest throws a plain Error for an empty string
    const search = typeFilter ? parseSearchRequest(typeFilter) : undefined;
    // Reject paths such as Patient/123/Observation, which would otherwise parse as a plain Observation search.
    // Only search criteria are allowed, so also reject result controls such as _sort, _count, and _include.
    if (
      search?.resourceType !== typeFilter.split('?')[0] ||
      Object.keys(search).some((key) => key !== 'resourceType' && key !== 'filters')
    ) {
      throw new OperationOutcomeError(badRequest(`Unsupported _typeFilter: ${typeFilter}`, '_typeFilter'));
    }
    // Throws if the filters are invalid for the resource type
    getSelectQueryForSearch(repo, { ...search });
    return search;
  });
}

export const exportPageSize = 1000;

export async function exportResources(
  exporter: BulkExporter,
  project: Project,
  types: string[] | undefined,
  exportLevel: string,
  since?: string,
  typeFilters?: SearchRequest[]
): Promise<void> {
  for (const resourceType of getExportResourceTypes(exporter.repo, exportLevel, types)) {
    const typeFilterSearches = typeFilters?.filter((search) => search.resourceType === resourceType);
    await exportResourceType(exporter, resourceType, exportPageSize, since, typeFilterSearches);
  }

  // Close the exporter
  await exporter.close(project);
}

export async function exportResourceType<T extends Resource>(
  exporter: BulkExporter,
  resourceType: T['resourceType'],
  count: number,
  since?: string,
  typeFilters?: SearchRequest[],
  onResource?: (resource: WithId<T>) => void
): Promise<void> {
  const repo = exporter.repo;
  const sinceFilters = since ? [{ code: '_lastUpdated', operator: Operator.GREATER_THAN_OR_EQUALS, value: since }] : [];
  // Multiple _typeFilter values for a type are ORed: each runs its own paginated search, and dedupe holds
  // every exported ID of the type in memory until closeWriter. A single search yields each resource once,
  // so it skips dedupe tracking.
  const skipDedupe = !typeFilters || typeFilters.length <= 1;
  for (const typeFilter of typeFilters?.length ? typeFilters : [undefined]) {
    const searchRequest: SearchRequest<T> = {
      resourceType,
      count,
      filters: [...sinceFilters, ...(typeFilter?.filters ?? [])],
      sortRules: [{ code: '_lastUpdated', descending: false }],
    };
    await repo.processAllResources(searchRequest, async (resource) => {
      onResource?.(resource);
      await exporter.writeResource(resource, { skipDedupe });
    });
  }

  // Close writer and free memory for this resource type immediately
  await exporter.closeWriter(resourceType);
}

/**
 * Returns the resource types to export for an export level, limited to the requested types the caller can search.
 * @param repo - The caller's repository.
 * @param exportLevel - The export level: System, Patient, or Group.
 * @param types - The requested _type values, if any.
 * @returns The resource types to export.
 */
export function getExportResourceTypes(
  repo: Repository,
  exportLevel: string,
  types: string[] | undefined
): ResourceType[] {
  return getResourceTypesByExportLevel(exportLevel).filter(
    (resourceType) =>
      canBeExported(resourceType) &&
      (!types || types.includes(resourceType)) &&
      repo.supportsInteraction(AccessPolicyInteraction.SEARCH, resourceType)
  );
}

function getResourceTypesByExportLevel(exportLevel: string): ResourceType[] {
  if (exportLevel === 'Patient') {
    return getPatientResourceTypes();
  }

  if (exportLevel === 'Group') {
    // Only these types can have a Patient in their compartments column
    return getPatientResourceTypes().filter((resourceType) => getPatientCompartmentParams(resourceType)?.length);
  }

  return getResourceTypes();
}

const unexportedResourceTypes = [
  'Binary',
  'CodeSystem',
  'OperationDefinition',
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
