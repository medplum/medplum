// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { accepted, concatUrls, parseReference, parseSearchRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Group, Patient, Project, ResourceType } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import type { Repository } from '../repo';
import type { PatientEverythingParameters } from './patienteverything';
import { getPatientEverything } from './patienteverything';
import { BulkExporter } from './utils/bulkexporter';
import { filterExportResources, parseExportParameters, parseExportTypeFilters } from './utils/export';

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
  const { types, since, typeFilters } = parseExportParameters(req);
  const searches = parseExportTypeFilters(ctx.repo, typeFilters);

  // First read the group as the user to verify access
  const group = await ctx.repo.readResource<Group>('Group', id);

  // Start the exporter
  const exporter = new BulkExporter(ctx.repo);
  const bulkDataExport = await exporter.start(concatUrls(baseUrl, 'fhir/R4/' + req.pathname));

  groupExportResources(
    ctx.repo,
    exporter,
    ctx.project,
    group,
    {
      _type: types as ResourceType[] | undefined,
      _since: since,
    },
    searches
  )
    .then(() => ctx.logger.info('Group export completed', { id: ctx.project.id }))
    .catch((err) => ctx.logger.error('Group export failed', { id: ctx.project.id, error: err }));

  return [accepted(`${baseUrl}fhir/R4/bulkdata/export/${bulkDataExport.id}`)];
}

export async function groupExportResources(
  repo: Repository,
  exporter: BulkExporter,
  project: Project,
  group: Group,
  params?: PatientEverythingParameters,
  typeFilters: SearchRequest[] = []
): Promise<void> {
  const types = typeof params?._type === 'string' ? params._type.split(',') : params?._type;
  // Read all patients in the group
  if (group.member) {
    for (const member of group.member) {
      if (!member.entity?.reference) {
        continue;
      }
      const [resourceType, memberId] = parseReference(member.entity);
      try {
        if (resourceType === 'Patient') {
          const patient = await repo.readResource<Patient>('Patient', memberId);
          let pageParams = params;
          while (true) {
            const bundle = await getPatientEverything(repo, patient, pageParams);
            // $everything includes the Patient and contextual references regardless of _type.
            // Apply export filters without changing $everything or restricting the patient cohort.
            const resources =
              bundle.entry?.flatMap((entry) =>
                entry.resource && (!types || types.includes(entry.resource.resourceType)) ? [entry.resource] : []
              ) ?? [];
            for (const resource of await filterExportResources(repo, resources, typeFilters)) {
              await exporter.writeResource(resource);
            }
            // A page with no filter matches can still be followed by matching resources.
            const next = bundle.link?.find((link) => link.relation === 'next');
            if (!next) {
              break;
            }
            const search = parseSearchRequest(next.url);
            pageParams = { ...params, _count: search.count, _offset: search.offset, _cursor: search.cursor };
          }
        } else if (!types || types.includes(resourceType)) {
          const resource = await repo.readResource(resourceType, memberId);
          for (const match of await filterExportResources(repo, [resource], typeFilters)) {
            await exporter.writeResource(match);
          }
        }
      } catch {
        getLogger().warn('Unable to read patient for group export', {
          reference: member.entity.reference,
        });
      }
    }

    // Close the exporter
    await exporter.close(project);
  }
}
