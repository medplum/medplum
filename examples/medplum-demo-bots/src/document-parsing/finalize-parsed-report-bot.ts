// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  Coding,
  DiagnosticReport,
  Observation,
  Organization,
  Provenance,
  ProvenanceAgent,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { NEEDS_CODE_ASSIGNMENT_TAG, upsertMapping } from './code-mapping';

/**
 * Finalize Parsed Report Bot
 *
 * Triggered by a Subscription on Task update where status=completed
 * and code=review-parsed-report.
 *
 * Responsibilities:
 * 1. Apply any code assignments the reviewer provided in Task.output to contained
 *    Observations that were marked `needs-code-assignment`.
 * 2. Refuse to finalize if any Observation still lacks a code after applying output.
 * 3. Promote contained Observations to standalone resources via a transaction bundle.
 * 4. Upsert the reviewer's code assignments into the performing Organization's
 *    ConceptMap, so future reports auto-map those test names.
 * 5. Record the reviewing practitioner in the Provenance.
 *
 * Subscription Criteria: Task?status=completed&code=review-parsed-report
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Task>): Promise<DiagnosticReport> {
  const task = event.input;

  if (task.status !== 'completed') {
    throw new Error('Expected Task with status=completed');
  }

  const taskCode = task.code?.coding?.[0]?.code;
  if (taskCode !== 'review-parsed-report') {
    throw new Error(`Unexpected task code: ${taskCode}`);
  }

  if (!task.focus?.reference) {
    throw new Error('Task has no focus reference');
  }
  const report = await medplum.readReference<DiagnosticReport>(task.focus as Reference<DiagnosticReport>);

  if (!report.contained || report.contained.length === 0) {
    throw new Error('DiagnosticReport has no contained resources to promote');
  }

  // Parse the reviewer's code assignments from Task.output, keyed by test name (lowercase).
  const codeAssignments = parseCodeAssignments(task);

  // Apply the assignments to the contained Observations.
  const { observations: updatedObservations, unresolvedTests } = applyCodeAssignments(
    report.contained.filter((r): r is Observation => r.resourceType === 'Observation'),
    codeAssignments
  );

  if (unresolvedTests.length > 0) {
    throw new Error(
      `Cannot finalize: ${unresolvedTests.length} test(s) still lack a code assignment: ${unresolvedTests.join(', ')}`
    );
  }

  // Build a transaction bundle that atomically promotes observations and updates the report.
  const bundle = buildFinalizationBundle(report, updatedObservations);

  console.log(`Finalizing DiagnosticReport/${report.id}: promoting ${updatedObservations.length} Observations`);

  const responseBundle = await medplum.executeBatch(bundle);
  const createdObservationIds = extractCreatedIds(responseBundle, 'Observation');

  // Upsert reviewer's assignments into the performing Organization's ConceptMap
  // so that future reports from the same lab auto-map these test names.
  await persistCodeAssignments(medplum, report, codeAssignments);

  // Record the reviewer in the Provenance
  await updateProvenance(medplum, report, task);

  console.log(
    `Finalized DiagnosticReport/${report.id} with ${createdObservationIds.length} standalone Observations; ` +
      `${codeAssignments.size} code assignment(s) added to mapping table`
  );

  return medplum.readResource('DiagnosticReport', report.id!);
}

/**
 * Parse code assignments from Task.output into a Map keyed by lowercase test name.
 *
 * Expected Task.output shape per assignment:
 *   {
 *     type: { text: <testName>, coding: [{ code: 'code-assignment' }] },
 *     valueCoding: { system: 'http://loinc.org', code: '2345-7', display: '...' }
 *   }
 */
function parseCodeAssignments(task: Task): Map<string, Coding> {
  const assignments = new Map<string, Coding>();
  for (const output of task.output || []) {
    const isCodeAssignment = output.type?.coding?.some((c) => c.code === 'code-assignment');
    if (!isCodeAssignment) {
      continue;
    }
    const testName = output.type?.text;
    const coding = output.valueCoding;
    if (testName && coding?.code && coding.system) {
      assignments.set(testName.toLowerCase().trim(), coding);
    }
  }
  return assignments;
}

/**
 * Apply reviewer-supplied codes to contained Observations and identify which
 * tests (if any) remain unmapped.
 */
function applyCodeAssignments(
  observations: Observation[],
  assignments: Map<string, Coding>
): { observations: Observation[]; unresolvedTests: string[] } {
  const unresolvedTests: string[] = [];
  const updated: Observation[] = observations.map((obs) => {
    const needsAssignment = obs.meta?.tag?.some(
      (tag) => tag.system === NEEDS_CODE_ASSIGNMENT_TAG.system && tag.code === NEEDS_CODE_ASSIGNMENT_TAG.code
    );
    if (!needsAssignment) {
      return obs;
    }

    const testName = obs.code?.text || '';
    const assignedCoding = assignments.get(testName.toLowerCase().trim());

    if (!assignedCoding) {
      unresolvedTests.push(testName);
      return obs;
    }

    // Apply the code and remove the needs-code-assignment tag
    const remainingTags = (obs.meta?.tag || []).filter(
      (tag) => !(tag.system === NEEDS_CODE_ASSIGNMENT_TAG.system && tag.code === NEEDS_CODE_ASSIGNMENT_TAG.code)
    );
    return {
      ...obs,
      code: {
        ...obs.code,
        coding: [assignedCoding],
      },
      meta: remainingTags.length > 0 ? { ...obs.meta, tag: remainingTags } : undefined,
    };
  });

  return { observations: updated, unresolvedTests };
}

/**
 * Upsert reviewer's code assignments into the performing Organization's ConceptMap.
 * This is how the mapping table self-improves over time: each human assignment becomes
 * an auto-map for the next report from the same lab.
 */
async function persistCodeAssignments(
  medplum: MedplumClient,
  report: DiagnosticReport,
  assignments: Map<string, Coding>
): Promise<void> {
  if (assignments.size === 0) {
    return;
  }

  const performerRef = report.performer?.[0];
  if (!performerRef?.reference || !performerRef.reference.startsWith('Organization/')) {
    console.warn('Cannot persist code assignments: DiagnosticReport has no Organization performer');
    return;
  }

  const organization = await medplum.readReference<Organization>(performerRef as Reference<Organization>);

  for (const [testName, coding] of assignments) {
    if (!coding.system || !coding.code) {
      continue;
    }
    await upsertMapping(medplum, organization, testName, {
      system: coding.system,
      code: coding.code,
      display: coding.display,
    });
  }
}

/**
 * Build a FHIR transaction Bundle that promotes contained Observations
 * to standalone resources and updates the DiagnosticReport.
 */
function buildFinalizationBundle(report: DiagnosticReport, observations: Observation[]): Bundle {
  const entries: BundleEntry[] = [];
  const containedIdToFullUrl: Record<string, string> = {};

  for (const obs of observations) {
    const containedId = obs.id!;
    const fullUrl = `urn:uuid:obs-${containedId}`;
    containedIdToFullUrl[`#${containedId}`] = fullUrl;

    const standaloneObs: Observation = {
      ...obs,
      id: undefined,
      status: 'final',
    };

    entries.push({
      fullUrl,
      resource: standaloneObs,
      request: {
        method: 'POST',
        url: 'Observation',
      },
    });
  }

  const updatedReport: DiagnosticReport = {
    ...report,
    status: 'final',
    result: report.result?.map((ref) => {
      const fullUrl = containedIdToFullUrl[ref.reference!];
      if (fullUrl) {
        return { ...ref, reference: fullUrl };
      }
      return ref;
    }),
  };

  delete (updatedReport as unknown as Record<string, unknown>).contained;

  entries.push({
    resource: updatedReport,
    request: {
      method: 'PUT',
      url: `DiagnosticReport/${report.id}`,
    },
  });

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  };
}

/**
 * Extract created resource IDs from a transaction response bundle.
 */
function extractCreatedIds(responseBundle: Bundle, resourceType: string): string[] {
  return (responseBundle.entry || [])
    .filter((entry) => entry.response?.location?.startsWith(`${resourceType}/`))
    .map((entry) => {
      const location = entry.response!.location!;
      const parts = location.split('/');
      return parts[1];
    });
}

/**
 * Update the Provenance resource to include the reviewing practitioner as an agent.
 */
async function updateProvenance(medplum: MedplumClient, report: DiagnosticReport, task: Task): Promise<void> {
  const provenances = await medplum.searchResources('Provenance', {
    target: `DiagnosticReport/${report.id}`,
  });

  if (provenances.length === 0) {
    console.warn(`No Provenance found for DiagnosticReport/${report.id}`);
    return;
  }

  const provenance = provenances[0] as Provenance;

  if (task.owner) {
    const verifierAgent: ProvenanceAgent = {
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
            code: 'verifier',
            display: 'Verifier',
          },
        ],
      },
      who: task.owner as ProvenanceAgent['who'],
    };
    const updatedAgents: ProvenanceAgent[] = [...(provenance.agent || []), verifierAgent];

    await medplum.updateResource<Provenance>({
      ...provenance,
      agent: updatedAgents,
    });
  }
}
