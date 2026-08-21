// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { addProfileToResource, createReference, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';
import type { CodeableConcept, Condition, Encounter, Patient, Reference } from '@medplum/fhirtypes';
import { syncEncounterDiagnosesToVisitChargeItems } from './chargeitems';

const ICD_10_CM = `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`;

/**
 * Adds order diagnoses (e.g. lab order `ServiceRequest.reasonCode`) to the encounter as
 * Condition resources referenced from `Encounter.diagnosis`, skipping ICD-10-CM codes the
 * encounter already has. The Billing tab only shows Conditions listed in `Encounter.diagnosis`,
 * so both writes are required.
 *
 * @param medplum - The Medplum client.
 * @param patient - The patient the diagnoses apply to.
 * @param encounter - The encounter to add the diagnoses to.
 * @param diagnoses - Diagnoses with ICD-10-CM codings, e.g. `ServiceRequest.reasonCode`.
 * @returns The updated encounter, or the current encounter if nothing was added.
 */
export async function addDiagnosesToEncounter(
  medplum: MedplumClient,
  patient: Patient,
  encounter: Encounter,
  diagnoses: CodeableConcept[]
): Promise<Encounter> {
  // Re-read from the server (bypassing the client cache) so a stale copy
  // (e.g. the Billing tab's debounced state) is not written back
  const latestEncounter = await medplum.readResource('Encounter', encounter.id as string, { cache: 'reload' });

  const existingConditions = await Promise.all(
    (latestEncounter.diagnosis ?? [])
      .map((d) => d.condition)
      .filter((ref): ref is Reference<Condition> => !!ref?.reference)
      .map((ref) => medplum.readReference(ref))
  );
  const existingCodes = new Set(
    existingConditions.flatMap((condition) => condition.code?.coding?.map((coding) => coding.code) ?? [])
  );

  const updatedDiagnosis = [...(latestEncounter.diagnosis ?? [])];
  const newConditions: Condition[] = [];
  for (const diagnosis of diagnoses) {
    const coding = diagnosis.coding?.find((c) => c.system === ICD_10_CM && c.code);
    if (!coding || existingCodes.has(coding.code)) {
      continue;
    }
    const condition = await medplum.createResource<Condition>(
      addProfileToResource(
        {
          resourceType: 'Condition',
          category: [
            {
              coding: [
                {
                  system: `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-category`,
                  code: 'problem-list-item',
                  display: 'Problem List Item',
                },
              ],
              text: 'Problem List Item',
            },
          ],
          clinicalStatus: {
            coding: [
              {
                system: `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-clinical`,
                code: 'active',
                display: 'Active',
              },
            ],
          },
          subject: createReference(patient),
          encounter: createReference(latestEncounter),
          code: { coding: [coding] },
        },
        `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns`
      )
    );
    existingCodes.add(coding.code);
    newConditions.push(condition);
    updatedDiagnosis.push({ condition: { reference: `Condition/${condition.id}` }, rank: updatedDiagnosis.length + 1 });
  }

  if (updatedDiagnosis.length === (latestEncounter.diagnosis?.length ?? 0)) {
    return latestEncounter;
  }
  const updatedEncounter = await medplum.updateResource({ ...latestEncounter, diagnosis: updatedDiagnosis });
  // Visit-level charge items (e.g. the E/M visit) mirror the encounter's diagnoses
  await syncEncounterDiagnosesToVisitChargeItems(medplum, updatedEncounter, [...existingConditions, ...newConditions]);
  return updatedEncounter;
}
