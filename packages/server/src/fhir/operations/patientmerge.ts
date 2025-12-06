// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, getReferenceString, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Identifier,
  OperationDefinition,
  OperationDefinitionParameter,
  OperationOutcome,
  Parameters,
  Patient,
  Provenance,
  Reference,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import type { Repository } from '../repo';
import { searchPatientCompartment } from './patienteverything';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  linkPatientRecords,
  mergePatientRecords,
  patientsAlreadyMerged,
  replaceReferences,
} from '@medplum/core';

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
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'source-patient-identifier',
      documentation:
        'Identifier(s) to resolve the source patient. The server SHALL reject the request if the provided identifiers do not resolve to a single patient record.',
      type: 'Identifier',
      min: 0,
      max: '*',
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
      use: 'in',
      name: 'target-patient-identifier',
      documentation:
        'Identifier(s) to resolve the target patient. The server SHALL reject the request if the provided identifiers do not resolve to a single patient record.',
      type: 'Identifier',
      min: 0,
      max: '*',
    },
    {
      use: 'in',
      name: 'result-patient',
      documentation:
        'The details of the Patient resource to use for the merge. Must have the same patient.id as target and include the link property. If not provided, the server will merge all identifiers from source and apply default merge logic.',
      type: 'Patient',
      min: 0,
      max: '1',
    },
    {
      use: 'in',
      name: 'preview',
      documentation:
        'If true, returns what the merge result would be WITHOUT performing the merge. Useful for user review.',
      type: 'boolean',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'input',
      documentation: 'Echo of the input parameters',
      type: 'Parameters',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'outcome',
      documentation: 'OperationOutcome with information about the merge',
      type: 'OperationOutcome',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'result',
      documentation: 'The final merged target Patient resource',
      type: 'Patient',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'return',
      documentation: 'Deprecated: use result instead. The updated target Patient resource',
      type: 'Patient',
      min: 0,
      max: '1',
    },
  ] as OperationDefinitionParameter[],
};

export interface PatientMergeParameters {
  'source-patient'?: Reference<Patient>;
  'source-patient-identifier'?: Identifier | Identifier[];
  'target-patient'?: Reference<Patient>;
  'target-patient-identifier'?: Identifier | Identifier[];
  'result-patient'?: Patient;
  preview?: boolean;
}

/**
 * Resolves a patient from either a direct reference or identifier(s).
 * @param repo - The repository to use for lookups.
 * @param reference - Direct patient reference (if provided).
 * @param identifiers - Identifier(s) to search by (if provided).
 * @param paramName - Name of the parameter (for error messages).
 * @returns The resolved patient reference.
 * @throws OperationOutcomeError if resolution fails or finds multiple patients.
 */
async function resolvePatientReference(
  repo: Repository,
  reference: Reference<Patient> | undefined,
  identifiers: Identifier | Identifier[] | undefined,
  paramName: string
): Promise<Reference<Patient>> {
  // If direct reference provided, use it
  if (reference) {
    return reference;
  }

  // If identifiers provided, resolve them
  if (identifiers) {
    const idArray = Array.isArray(identifiers) ? identifiers : [identifiers];

    // Build search query for identifiers
    const searchParams = new URLSearchParams();
    for (const identifier of idArray) {
      if (identifier.system && identifier.value) {
        searchParams.append('identifier', `${identifier.system}|${identifier.value}`);
      } else if (identifier.value) {
        searchParams.append('identifier', identifier.value);
      }
    }

    const bundle = await repo.search({
      resourceType: 'Patient',
      filters: Array.from(searchParams.entries()).map(([code, value]) => ({ code, operator: 'eq' as const, value })),
    });

    if (!bundle.entry || bundle.entry.length === 0) {
      throw new OperationOutcomeError(badRequest(`No patient found matching ${paramName} identifier(s)`));
    }

    if (bundle.entry.length > 1) {
      throw new OperationOutcomeError(
        badRequest(`Multiple patients found matching ${paramName} identifier(s). Expected exactly one.`)
      );
    }

    const patient = bundle.entry[0].resource as Patient;
    return { reference: `Patient/${patient.id}` };
  }

  throw new OperationOutcomeError(badRequest(`Either ${paramName} or ${paramName}-identifier must be provided`));
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
 * @param req - The FHIR request.
 * @returns The FHIR response with the merged target patient.
 */
export async function patientMergeHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<PatientMergeParameters>(operation, req);

  // Resolve source patient
  const sourcePatientRef = await resolvePatientReference(
    ctx.repo,
    params['source-patient'],
    params['source-patient-identifier'],
    'source-patient'
  );

  // Resolve target patient
  let targetPatientRef: Reference<Patient>;
  const targetPatientId = req.params.id;

  if (targetPatientId) {
    // Instance-level operation: validate that the patient exists
    try {
      await ctx.repo.readResource<Patient>('Patient', targetPatientId);
    } catch {
      return [badRequest(`Target patient with ID ${targetPatientId} not found`)];
    }
    targetPatientRef = { reference: `Patient/${targetPatientId}` };
  } else {
    // Type-level operation: resolve from parameter or identifier
    targetPatientRef = await resolvePatientReference(
      ctx.repo,
      params['target-patient'],
      params['target-patient-identifier'],
      'target-patient'
    );
  }

  // Execute merge (or preview)
  const isPreview = params.preview === true;
  const result = await executeMerge(ctx.repo, sourcePatientRef, targetPatientRef, params['result-patient'], isPreview);

  // Echo back the original input Parameters resource (true echo of what was received)
  // If instance-level operation, we need to add the target-patient reference that was in the URL
  let inputParams: Parameters;
  if (req.body?.resourceType === 'Parameters' && req.body?.parameter) {
    // Use the original Parameters resource as-is
    inputParams = req.body as Parameters;

    // If this was an instance-level operation, add the target-patient parameter
    // (since it came from the URL path, not the body)
    if (targetPatientId) {
      const hasTargetParam = inputParams.parameter?.some((p) => p.name === 'target-patient');
      if (!hasTargetParam) {
        inputParams = {
          ...inputParams,
          parameter: [...(inputParams.parameter || []), { name: 'target-patient', valueReference: targetPatientRef }],
        };
      }
    }
  } else {
    // Fallback: construct Parameters if body wasn't in Parameters format
    inputParams = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'source-patient', valueReference: sourcePatientRef },
        { name: 'target-patient', valueReference: targetPatientRef },
      ],
    };
  }

  // Build outcome with machine-readable resourcesUpdated count
  const outcome: OperationOutcome = {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'information',
        code: 'informational',
        details: {
          text: (() => {
            if (isPreview) {
              return `Preview: Merge would update ${result.resourcesUpdated} clinical resource(s).`;
            }
            if (result.resourcesUpdated > 0) {
              return `Patient merge completed successfully. Updated ${result.resourcesUpdated} clinical resource(s).`;
            }
            return 'Patient merge completed successfully.';
          })(),
          extension: [
            {
              url: 'https://medplum.com/fhir/StructureDefinition/patient-merge-resources-updated',
              valueInteger: result.resourcesUpdated,
            },
            ...(isPreview
              ? [
                  {
                    url: 'https://medplum.com/fhir/StructureDefinition/patient-merge-preview',
                    valueBoolean: true,
                  },
                ]
              : []),
          ],
        },
      },
    ],
  };

  // Create Provenance resource for audit trail (unless in preview mode)
  if (!isPreview) {
    await createMergeProvenance(ctx.repo, result.source, result.target);
  }

  // Return FHIR spec-compliant output with backward compatibility
  return [
    allOk,
    buildOutputParameters(operation, {
      input: inputParams,
      outcome: outcome,
      result: result.target,
      return: result.target, // Deprecated but kept for backward compatibility
    }),
  ];
}

interface MergeResult {
  target: WithId<Patient>;
  source: WithId<Patient>;
  resourcesUpdated: number;
}

/**
 * Executes the merge operation for two patients.
 * @param repo - The repository to use for operations.
 * @param sourceRef - Reference to the source patient.
 * @param targetRef - Reference to the target patient.
 * @param resultPatient - Optional custom merged patient resource to use instead of auto-merge.
 * @param preview - If true, don't actually commit the changes (preview mode).
 * @returns The merge result containing the updated target patient and count of updated resources.
 */
export async function executeMerge(
  repo: Repository,
  sourceRef: Reference<Patient>,
  targetRef: Reference<Patient>,
  resultPatient?: Patient,
  preview: boolean = false
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
        source: sourcePatient,
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

  // If result-patient is provided, validate and use it
  let mergedPatients: { src: WithId<Patient>; target: WithId<Patient> };

  if (resultPatient) {
    // Validate result-patient
    if (resultPatient.id !== targetId) {
      throw new OperationOutcomeError(
        badRequest(`result-patient id (${resultPatient.id}) must match target-patient id (${targetId})`)
      );
    }

    // Ensure result-patient has the required link
    const hasReplacesLink = resultPatient.link?.some(
      (link) => link.type === 'replaces' && link.other.reference === getReferenceString(sourcePatient)
    );
    if (!hasReplacesLink) {
      throw new OperationOutcomeError(badRequest(`result-patient must include a 'replaces' link to source patient`));
    }

    // Use the provided result-patient as the merged target
    // Still need to update source patient with replaced-by link
    const linkedSource = linkPatientRecords(sourcePatient, targetPatient);
    mergedPatients = {
      src: linkedSource.src,
      target: resultPatient as WithId<Patient>,
    };
  } else {
    // Default merge logic: link and merge identifiers
    const linkedPatients = linkPatientRecords(sourcePatient, targetPatient);
    mergedPatients = mergePatientRecords(linkedPatients.src, linkedPatients.target);
  }

  // Rewrite all clinical resource references from source to target
  // Note: In preview mode, we count but don't actually update
  const resourcesUpdated = await rewriteClinicalReferences(repo, mergedPatients.src, mergedPatients.target, preview);

  // Update both patients (unless in preview mode)
  if (!preview) {
    await repo.updateResource(mergedPatients.src);
    await repo.updateResource(mergedPatients.target);
  }

  return {
    source: mergedPatients.src,
    target: mergedPatients.target,
    resourcesUpdated,
  };
}

/**
 * Creates a Provenance resource to track the merge operation.
 * @param repo - The repository to use for creating the resource.
 * @param sourcePatient - The source patient that was merged.
 * @param targetPatient - The target patient that received the merge.
 * @returns The created Provenance resource.
 */
async function createMergeProvenance(
  repo: Repository,
  sourcePatient: WithId<Patient>,
  targetPatient: WithId<Patient>
): Promise<Provenance> {
  const ctx = getAuthenticatedContext();
  const now = new Date().toISOString();

  const provenance: Provenance = {
    resourceType: 'Provenance',
    recorded: now,
    target: [
      { reference: `${getReferenceString(targetPatient)}/_history/${targetPatient.meta?.versionId || '1'}` },
      { reference: `${getReferenceString(sourcePatient)}/_history/${sourcePatient.meta?.versionId || '1'}` },
    ],
    occurredDateTime: now,
    reason: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
            code: 'PATADMIN',
            display: 'patient administration',
          },
        ],
        text: 'patient administration',
      },
    ],
    activity: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle',
          code: 'merge',
          display: 'Merge Record Lifecycle Event',
        },
      ],
      text: 'Merge Record Lifecycle Event',
    },
    agent: [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
              code: 'performer',
              display: 'Performer',
            },
          ],
          text: 'Performer',
        },
        who: {
          reference: getReferenceString(ctx.login),
        },
      },
    ],
  };

  return repo.createResource(provenance);
}

/**
 * Rewrites all clinical resource references from source patient to target patient.
 * Uses searchPatientCompartment to get all resources in the patient compartment.
 * Note: This implementation only processes the first page of results (no pagination).
 * Pagination support will be added in a subsequent PR.
 *
 * @param repo - The repository to use for operations.
 * @param sourcePatient - The source patient whose references will be replaced.
 * @param targetPatient - The target patient that references will point to.
 * @param preview - If true, count resources but don't actually update them.
 * @returns The number of resources that were (or would be) updated.
 */
async function rewriteClinicalReferences(
  repo: Repository,
  sourcePatient: WithId<Patient>,
  targetPatient: WithId<Patient>,
  preview: boolean = false
): Promise<number> {
  const srcReference = getReferenceString(sourcePatient);
  const targetReference = getReferenceString(targetPatient);
  let totalUpdated = 0;

  // Process only the first page of results (pagination will be added later)
  const bundle = await searchPatientCompartment(repo, sourcePatient, { offset: 0, count: 1000 });

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

    // Update the resource (unless in preview mode)
    if (!preview) {
      await repo.updateResource(resource);
    }
    totalUpdated++;
  }

  return totalUpdated;
}
