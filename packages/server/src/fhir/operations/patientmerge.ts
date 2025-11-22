// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  accepted,
  allOk,
  badRequest,
  concatUrls,
  getReferenceString,
  OperationOutcomeError,
  parseSearchRequest,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  OperationDefinition,
  OperationDefinitionParameter,
  Parameters,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import type { Repository } from '../repo';
import { searchPatientCompartment } from './patienteverything';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  linkPatientRecords,
  mergePatientRecords,
  patientsAlreadyMerged,
  replaceReferences,
} from './utils/patientmergeutils';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'Patient-merge',
  name: 'PatientMerge',
  status: 'active',
  kind: 'operation',
  code: 'merge',
  description: 'Merges two Patient resources, consolidating data from source into target',
  resource: ['Patient'],
  system: false,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'source-patient',
      documentation: 'Reference to the source Patient resource that will be merged into the target',
      type: 'Reference',
      min: 1,
      max: '1',
    },
    {
      use: 'in',
      name: 'target-patient',
      documentation:
        'Reference to the target Patient resource that will receive the merged data. Optional if patient ID is provided in the URL path.',
      type: 'Reference',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'return',
      documentation: 'The updated target Patient resource',
      type: 'Patient',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'resourcesUpdated',
      documentation: 'Number of clinical resources that had their references updated',
      type: 'integer',
      min: 0,
      max: '1',
    },
  ] as OperationDefinitionParameter[],
};

export interface PatientMergeParameters {
  'source-patient': Reference<Patient>;
  'target-patient'?: Reference<Patient>;
}

/**
 * Handles the Patient $merge operation.
 * Merges two patient resources by:
 * 1. Linking the source patient to the target with 'replaced-by' relationship
 * 2. Linking the target patient to the source with 'replaces' relationship
 * 3. Merging identifiers from source into target (marked as 'old')
 * 4. Updating all clinical resource references from source to target
 * 5. Setting source patient to inactive
 *
 * Supports both type-level (`POST /Patient/$merge`) and instance-level (`POST /Patient/:id/$merge`) operations.
 * When called as instance-level, the `:id` parameter is used as the target-patient.
 *
 * Supports both synchronous and asynchronous execution via Prefer: respond-async header.
 *
 * @param req - The FHIR request.
 * @returns The FHIR response with the merged target patient.
 */
export async function patientMergeHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<PatientMergeParameters>(operation, req);

  // Check if this is an instance-level operation (ID in URL path)
  const targetPatientId = req.params.id;
  let targetPatientRef: Reference<Patient>;

  if (targetPatientId) {
    // Instance-level operation: validate that the patient exists
    try {
      await ctx.repo.readResource<Patient>('Patient', targetPatientId);
    } catch (err) {
      return [badRequest(`Target patient with ID ${targetPatientId} not found`)];
    }
    targetPatientRef = { reference: `Patient/${targetPatientId}` };
  } else {
    // Type-level operation: target-patient must be provided in parameters
    if (!params['target-patient']) {
      return [badRequest('target-patient parameter is required when not using instance-level operation')];
    }
    targetPatientRef = params['target-patient'];
  }

  if (!params['source-patient']) {
    return [badRequest('source-patient parameter is required')];
  }

  // Check for async execution (header is case-insensitive)
  const preferHeader = req.headers?.['prefer'] || req.headers?.['Prefer'];
  if (preferHeader === 'respond-async') {
    const { baseUrl } = getConfig();
    const exec = new AsyncJobExecutor(ctx.repo);
    await exec.init(concatUrls(baseUrl, 'fhir/R4' + req.pathname));

    exec.start(async () => {
      const result = await executeMerge(ctx.repo, params['source-patient'], targetPatientRef);
      return {
        resourceType: 'Parameters',
        parameter: [
          { name: 'return', resource: result.target },
          { name: 'resourcesUpdated', valueInteger: result.resourcesUpdated },
        ],
      } satisfies Parameters;
    });

    return [accepted(exec.getContentLocation(baseUrl))];
  }

  // Synchronous execution
  const result = await executeMerge(ctx.repo, params['source-patient'], targetPatientRef);
  return [allOk, buildOutputParameters(operation, { return: result.target, resourcesUpdated: result.resourcesUpdated })];
}

interface MergeResult {
  target: WithId<Patient>;
  resourcesUpdated: number;
}

/**
 * Executes the merge operation for two patients.
 * @param repo - The repository to use for operations.
 * @param sourceRef - Reference to the source patient.
 * @param targetRef - Reference to the target patient.
 * @returns The merge result containing the updated target patient and count of updated resources.
 */
async function executeMerge(
  repo: Repository,
  sourceRef: Reference<Patient>,
  targetRef: Reference<Patient>
): Promise<MergeResult> {
  // Read both patients
  const sourceId = sourceRef.reference?.split('/')[1];
  const targetId = targetRef.reference?.split('/')[1];

  if (!sourceId || !targetId) {
    throw new OperationOutcomeError(badRequest('Invalid patient reference format'));
  }

  if (sourceId === targetId) {
    throw new OperationOutcomeError(badRequest('Source and target patients cannot be the same'));
  }

  const sourcePatient = await repo.readResource<Patient>('Patient', sourceId);
  const targetPatient = await repo.readResource<Patient>('Patient', targetId);

  // Check if already merged (idempotent operation)
  try {
    if (patientsAlreadyMerged(sourcePatient, targetPatient)) {
      // Already merged, return target as-is
      return {
        target: targetPatient,
        resourcesUpdated: 0,
      };
    }
  } catch (err) {
    // If patientsAlreadyMerged throws, it means link structure is inconsistent
    // This is a data integrity issue that should be fixed, not ignored
    getLogger().error('Inconsistent link structure detected', { error: err, sourceId, targetId });
    throw new OperationOutcomeError(
      badRequest(
        `Inconsistent patient link structure detected. This indicates a data integrity issue. Error: ${err instanceof Error ? err.message : String(err)}`
      )
    );
  }

  // Link the patient records
  const linkedPatients = linkPatientRecords(sourcePatient, targetPatient);

  // Merge identifiers and contact info
  const mergedPatients = mergePatientRecords(linkedPatients.src, linkedPatients.target);

  // Rewrite all clinical resource references from source to target
  const resourcesUpdated = await rewriteClinicalReferences(repo, mergedPatients.src, mergedPatients.target);

  // Update both patients
  await repo.updateResource(mergedPatients.src);
  await repo.updateResource(mergedPatients.target);

  return {
    target: mergedPatients.target,
    resourcesUpdated,
  };
}

/**
 * Rewrites all clinical resource references from source patient to target patient.
 * Uses searchPatientCompartment to get all resources in the patient compartment.
 * Handles pagination and rate limiting.
 *
 * @param repo - The repository to use for operations.
 * @param sourcePatient - The source patient whose references will be replaced.
 * @param targetPatient - The target patient that references will point to.
 * @returns The number of resources that were updated.
 */
async function rewriteClinicalReferences(
  repo: Repository,
  sourcePatient: WithId<Patient>,
  targetPatient: WithId<Patient>
): Promise<number> {
  const srcReference = getReferenceString(sourcePatient);
  const targetReference = getReferenceString(targetPatient);
  let totalUpdated = 0;

  // Handle pagination - searchPatientCompartment returns paginated results
  const search: Partial<SearchRequest> = { offset: 0, count: 1000 };
  const maxSearchOffset = getConfig().maxSearchOffset ?? Number.POSITIVE_INFINITY;

  while ((search.offset ?? 0) <= maxSearchOffset) {
    const bundle = await searchPatientCompartment(repo, sourcePatient, search);

    for (const entry of bundle.entry ?? []) {
      const resource = entry.resource;
      if (!resource) {
        continue;
      }

      // Skip the Patient resource itself
      if (resource.resourceType === 'Patient') {
        continue;
      }

      // Replace references in the resource
      replaceReferences(resource, srcReference, targetReference);

      // Update the resource (repo.updateResource already handles rate limiting internally)
      await repo.updateResource(resource);
      totalUpdated++;
    }

    // Check for next page
    const nextLink = bundle.link?.find((l) => l.relation === 'next');
    if (nextLink?.url) {
      const nextSearch = parseSearchRequest(nextLink.url);
      search.offset = nextSearch.offset;
    } else {
      break; // No more pages
    }
  }

  return totalUpdated;
}
