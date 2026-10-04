// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import {
  accepted,
  AccessPolicyInteraction,
  arrayify,
  badRequest,
  concatUrls,
  getResourceTypes,
  OperationOutcomeError,
  Operator,
  protectedResourceTypes,
  singularize,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Project, Resource, ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getPatientResourceTypes } from '../patient';
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
  assertNoTypeFilters(typeFilters);

  const exporter = new BulkExporter(ctx.repo);
  const bulkDataExport = await exporter.start(concatUrls(baseUrl, 'fhir/R4' + req.pathname));

  exportResources(exporter, ctx.project, types, exportType, since)
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

export async function exportResources(
  exporter: BulkExporter,
  project: Project,
  types: string[] | undefined,
  exportLevel: string,
  since?: string
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
    await exportResourceType(exporter, resourceType, pageSize, since);
  }

  // Close the exporter
  await exporter.close(project);
}

export async function exportResourceType<T extends Resource>(
  exporter: BulkExporter,
  resourceType: T['resourceType'],
  count: number,
  since?: string
): Promise<void> {
  const repo = exporter.repo;
  const searchRequest: SearchRequest<T> | undefined = {
    resourceType,
    count,
    filters: since ? [{ code: '_lastUpdated', operator: Operator.GREATER_THAN_OR_EQUALS, value: since }] : undefined,
    sortRules: [{ code: '_lastUpdated', descending: false }],
  };
  await repo.processAllResources(searchRequest, async (resource) => {
    // Cursor pagination yields each resource exactly once, so skip the exporter's dedupe tracking
    await exporter.writeResource(resource, { skipDedupe: true });
  });

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
