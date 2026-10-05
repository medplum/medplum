// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { accepted, concatUrls, isResource, Operator, parseReference } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Group, Project, Resource } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import type { Repository } from '../repo';
import {
  assertNoTypeFilters,
  exportPageSize,
  exportResourceType,
  getExportResourceTypes,
  parseExportParameters,
} from './export';
import { collectReferences, shouldResolveReference } from './patienteverything';
import { BulkExporter } from './utils/bulkexporter';

/**
 * Handles a Group export request.
 *
 * Endpoint - Group of Patients
 *   [fhir base]/Group/[id]/$export
 *
 * See: https://hl7.org/fhir/uv/bulkdata/export.html
 * See: https://hl7.org/fhir/R4/async.html
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function groupExportHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { baseUrl } = getConfig();
  const { id } = req.params;
  const { since, types, typeFilters } = parseExportParameters(req);
  assertNoTypeFilters(typeFilters);

  // First read the group as the user to verify access
  const group = await ctx.repo.readResource<Group>('Group', id);

  // Start the exporter
  const exporter = new BulkExporter(ctx.repo);
  const bulkDataExport = await exporter.start(concatUrls(baseUrl, 'fhir/R4/' + req.pathname));

  groupExportResources(ctx.repo, exporter, ctx.project, group, types, since)
    .then(() => ctx.logger.info('Group export completed', { id: ctx.project.id }))
    .catch((err) => ctx.logger.error('Group export failed', { id: ctx.project.id, error: err }));

  return [accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`)];
}

export async function groupExportResources(
  repo: Repository,
  exporter: BulkExporter,
  project: Project,
  group: Group,
  types?: string[],
  since?: string
): Promise<void> {
  const patientReferences: string[] = [];
  for (const member of group.member ?? []) {
    if (!member.entity?.reference) {
      continue;
    }
    const [resourceType, memberId] = parseReference(member.entity);
    if (resourceType === 'Patient') {
      patientReferences.push(member.entity.reference);
    } else if (!types || types.includes(resourceType)) {
      try {
        await exporter.writeResource(await repo.readResource(resourceType, memberId));
      } catch {
        getLogger().warn('Unable to read member for group export', { reference: member.entity.reference });
      }
    }
  }

  if (patientReferences.length > 0) {
    const compartment = { code: '_compartment', operator: Operator.EQUALS, value: patientReferences.join(',') };
    const references = new Set<string>();
    for (const resourceType of getExportResourceTypes(repo, 'Group', types)) {
      await exportResourceType(
        exporter,
        resourceType,
        exportPageSize,
        since,
        [{ resourceType, filters: [compartment] }],
        (resource) => addResolvableReferences(resource, references)
      );
    }
    await exportReferencedResources(repo, exporter, references, types);
  }

  await exporter.close(project);
}

/**
 * Exports resources such as Organization and Practitioner that are referenced by exported resources,
 * matching the referenced resources included by Patient $everything.
 * These types must stay outside the Patient compartment, because their writers would already be closed.
 * References are followed through types excluded by _type, so an included type is still reached.
 * @param repo - The caller's repository.
 * @param exporter - The bulk exporter.
 * @param references - The references collected from exported Patient compartment resources.
 * @param types - The requested _type values, if any.
 */
async function exportReferencedResources(
  repo: Repository,
  exporter: BulkExporter,
  references: Set<string>,
  types: string[] | undefined
): Promise<void> {
  const resolved = new Set<string>();
  let pending = Array.from(references);
  while (pending.length > 0) {
    pending.forEach((reference) => resolved.add(reference));
    const next = new Set<string>();
    for (let i = 0; i < pending.length; i += exportPageSize) {
      const batch = pending.slice(i, i + exportPageSize);
      const resources = await repo.readReferences(batch.map((reference) => ({ reference })));
      for (const resource of resources) {
        if (!isResource(resource)) {
          continue;
        }
        if (!types || types.includes(resource.resourceType)) {
          await exporter.writeResource(resource);
        }
        addResolvableReferences(resource, next);
      }
    }
    pending = Array.from(next).filter((reference) => !resolved.has(reference));
  }
}

function addResolvableReferences(resource: Resource, references: Set<string>): void {
  for (const reference of collectReferences(resource)) {
    if (shouldResolveReference(reference)) {
      references.add(reference);
    }
  }
}
