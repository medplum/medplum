// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  DiagnosticReport,
  Observation,
  Provenance,
  ProvenanceAgent,
  Reference,
  Task,
} from '@medplum/fhirtypes';

/**
 * Finalize Parsed Report Bot
 *
 * Triggered by a Subscription on Task update where status=completed
 * and code=review-parsed-report.
 *
 * Promotes contained Observations from the DiagnosticReport to standalone
 * resources, updates the DiagnosticReport status to final, and records
 * the reviewing practitioner in the Provenance.
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

  // Read the DiagnosticReport from the Task focus
  if (!task.focus?.reference) {
    throw new Error('Task has no focus reference');
  }
  const report = await medplum.readReference<DiagnosticReport>(task.focus as Reference<DiagnosticReport>);

  if (!report.contained || report.contained.length === 0) {
    throw new Error('DiagnosticReport has no contained resources to promote');
  }

  // Build a transaction bundle that atomically:
  // 1. Creates standalone Observations from contained resources
  // 2. Updates the DiagnosticReport (removes contained, updates result references, sets status=final)
  const bundle = buildFinalizationBundle(report);

  console.log(`Finalizing DiagnosticReport/${report.id}: promoting ${report.contained.length} contained Observations`);

  const responseBundle = await medplum.executeBatch(bundle);

  // Extract the created Observation IDs from the response
  const createdObservationIds = extractCreatedIds(responseBundle, 'Observation');

  // Update Provenance to record the reviewer
  await updateProvenance(medplum, report, task);

  console.log(`Finalized DiagnosticReport/${report.id} with ${createdObservationIds.length} standalone Observations`);

  // Return the updated report
  return medplum.readResource('DiagnosticReport', report.id!);
}

/**
 * Build a FHIR transaction Bundle that promotes contained Observations
 * to standalone resources and updates the DiagnosticReport.
 */
function buildFinalizationBundle(report: DiagnosticReport): Bundle {
  const entries: BundleEntry[] = [];
  const containedIdToFullUrl: Record<string, string> = {};

  // Create entries for each contained Observation
  const containedObservations = (report.contained || []).filter(
    (r): r is Observation => r.resourceType === 'Observation'
  );

  for (const obs of containedObservations) {
    const containedId = obs.id!;
    const fullUrl = `urn:uuid:obs-${containedId}`;
    containedIdToFullUrl[`#${containedId}`] = fullUrl;

    // Remove the contained-specific id and set status to final
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

  // Update the DiagnosticReport: remove contained, update references, set status=final
  const updatedReport: DiagnosticReport = {
    ...report,
    status: 'final',
    contained: undefined,
    result: report.result?.map((ref) => {
      const fullUrl = containedIdToFullUrl[ref.reference!];
      if (fullUrl) {
        return { ...ref, reference: fullUrl };
      }
      return ref;
    }),
  };

  // Remove the contained field entirely
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
      // Location format: "ResourceType/id/_history/version"
      const parts = location.split('/');
      return parts[1];
    });
}

/**
 * Update the Provenance resource to include the reviewing practitioner as an agent.
 */
async function updateProvenance(medplum: MedplumClient, report: DiagnosticReport, task: Task): Promise<void> {
  // Find the Provenance resource targeting this DiagnosticReport
  const provenances = await medplum.searchResources('Provenance', {
    target: `DiagnosticReport/${report.id}`,
  });

  if (provenances.length === 0) {
    console.warn(`No Provenance found for DiagnosticReport/${report.id}`);
    return;
  }

  const provenance = provenances[0] as Provenance;

  // Add the reviewer (Task owner) as a verifier agent
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
