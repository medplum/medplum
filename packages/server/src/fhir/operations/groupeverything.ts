// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, getReferenceString, parseReference } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Bundle, BundleEntry, Group, Patient, Resource } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import type { Repository } from '../repo';
import { getFullUrl } from '../response';
import { getOperationDefinition } from './definitions';
import type { PatientEverythingParameters } from './patienteverything';
import { getPatientEverything } from './patienteverything';
import { parseInputParameters } from './utils/parameters';

const operation = getOperationDefinition('Group', 'everything');

// https://hl7.org/fhir/operation-group-everything.html
/**
 * Handles a Group everything request.
 * Searches for all resources related to all patients in the group.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function groupEverythingHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const params = parseInputParameters<PatientEverythingParameters>(operation, req);

  const group = await ctx.repo.readResource<Group>('Group', id);
  const bundle = await getGroupEverything(ctx.repo, group, params);

  return [allOk, bundle];
}

/**
 * Executes the Group $everything operation.
 * Searches for all resources related to all patients in the group.
 * @param repo - The repository.
 * @param group - The group resource.
 * @param params - The operation input parameters.
 * @returns The group everything search result bundle.
 */
export async function getGroupEverything(
  repo: Repository,
  group: WithId<Group>,
  params?: PatientEverythingParameters
): Promise<Bundle<WithId<Resource>>> {
  const allEntries: BundleEntry[] = [];
  const seenReferences = new Set<string>();

  allEntries.push({
    fullUrl: getFullUrl('Group', group.id),
    search: { mode: 'match' },
    resource: group,
  });
  seenReferences.add(getReferenceString(group));

  if (group.member) {
    for (const member of group.member) {
      if (!member.entity?.reference) {
        continue;
      }

      const [resourceType, memberId] = parseReference(member.entity);

      try {
        if (resourceType === 'Patient') {
          const patient = await repo.readResource<Patient>('Patient', memberId);
          const patientBundle = await getPatientEverything(repo, patient, params);

          if (patientBundle.entry) {
            for (const entry of patientBundle.entry) {
              const resource = entry.resource as WithId<Resource>;
              const refString = getReferenceString(resource);
              if (!seenReferences.has(refString)) {
                seenReferences.add(refString);
                allEntries.push({
                  fullUrl: getFullUrl(resource.resourceType, resource.id),
                  search: entry.search ?? { mode: 'match' },
                  resource,
                });
              }
            }
          }
        } else {
          const resource = await repo.readResource(resourceType, memberId);
          const refString = getReferenceString(resource);
          if (!seenReferences.has(refString)) {
            seenReferences.add(refString);
            allEntries.push({
              fullUrl: getFullUrl(resource.resourceType, resource.id as string),
              search: { mode: 'match' },
              resource,
            });
          }
        }
      } catch (err) {
        getLogger().warn('Unable to read member for group everything', {
          reference: member.entity.reference,
          error: err,
        });
      }
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: allEntries,
    total: allEntries.length,
  };
}
