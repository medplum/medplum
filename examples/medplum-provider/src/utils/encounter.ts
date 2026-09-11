// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, PatchOperation, WithId } from '@medplum/core';
import {
  addProfileToResource,
  createReference,
  getExtension,
  getReferenceString,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
  isReference,
  isResource,
} from '@medplum/core';
import type {
  Appointment,
  ChargeItem,
  ClinicalImpression,
  CodeableConcept,
  Coding,
  Condition,
  Encounter,
  EncounterDiagnosis,
  Patient,
  PlanDefinition,
  Practitioner,
  Reference,
  Schedule,
  ServiceRequest,
  Slot,
  Task,
} from '@medplum/fhirtypes';

export async function createAppointment(
  medplum: MedplumClient,
  start: Date,
  end: Date,
  patient: Patient | Reference<Patient>,
  practitioner: Practitioner | Reference<Practitioner>,
  schedule?: Schedule
): Promise<Appointment> {
  const practitionerRef = isResource(practitioner) ? createReference(practitioner) : practitioner;
  const patientRef = isResource(patient) ? createReference(patient) : patient;

  // If we have a schedule reference, add a busy slot to prevent future
  // scheduling operations (such as $find or $book) from thinking this
  // time is free.
  let slot: WithId<Slot> | undefined = undefined;
  if (schedule) {
    slot = await medplum.createResource({
      resourceType: 'Slot',
      start: start.toISOString(),
      end: end.toISOString(),
      schedule: createReference(schedule),
      status: 'busy',
    });
  }

  const appointment = await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start: start.toISOString(),
    end: end.toISOString(),
    slot: slot ? [createReference(slot)] : undefined,
    participant: [
      {
        actor: patientRef,
        status: 'accepted',
      },
      {
        actor: practitionerRef,
        status: 'accepted',
      },
    ],
  });

  return appointment;
}

export async function createEncounter(
  medplum: MedplumClient,
  classification: Coding,
  patient: Patient | Reference<Patient>,
  planDefinition: PlanDefinition | undefined,
  appointment: Appointment,
  practitioner: Practitioner | Reference<Practitioner>
): Promise<WithId<Encounter>> {
  const practitionerRef = isResource(practitioner) ? createReference(practitioner) : practitioner;
  const patientRef = isResource(patient) ? createReference(patient) : patient;

  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'planned',
    statusHistory: [],
    classHistory: [],
    class: classification,
    type: planDefinition?.title ? [{ text: planDefinition.title }] : undefined,
    subject: patientRef,
    appointment: [createReference(appointment)],
    participant: [{ individual: practitionerRef }],
  });

  const clinicalImpressionData: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'in-progress',
    description: 'Initial clinical impression',
    subject: patientRef,
    encounter: createReference(encounter),
    date: new Date().toISOString(),
  };

  await medplum.createResource(clinicalImpressionData);

  if (planDefinition) {
    await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinition.id as string, '$apply'), {
      resourceType: 'Parameters',
      parameter: [
        { name: 'subject', valueString: getReferenceString(patient) },
        { name: 'encounter', valueString: getReferenceString(encounter) },
        { name: 'practitioner', valueString: getReferenceString(practitioner) },
      ],
    });

    await createChargeItemFromPlanDefinition(medplum, encounter, patientRef, planDefinition);
  }

  await handleChargeItemsFromTasks(medplum, encounter, patientRef);

  return encounter;
}

async function createChargeItemFromPlanDefinition(
  medplum: MedplumClient,
  encounter: Encounter,
  patient: Reference<Patient>,
  planDefinition: PlanDefinition
): Promise<void> {
  const serviceBillingCodeExtension = getExtension(
    planDefinition,
    `${HTTP_HL7_ORG}/fhir/uv/order-catalog/StructureDefinition/ServiceBillingCode`
  );

  const chargeDefinitionExtension = getExtension(
    planDefinition,
    'http://medplum.com/fhir/StructureDefinition/applicable-charge-definition'
  );

  if (!serviceBillingCodeExtension?.valueCodeableConcept || !chargeDefinitionExtension?.valueCanonical) {
    console.log('PlanDefinition missing required extensions for charge item creation');
    return;
  }

  const cptCoding = serviceBillingCodeExtension.valueCodeableConcept.coding?.find(
    (coding) => coding.system === 'http://www.ama-assn.org/go/cpt'
  );

  if (!cptCoding) {
    return;
  }

  const chargeItem: ChargeItem = {
    resourceType: 'ChargeItem',
    status: 'planned',
    subject: patient,
    context: createReference(encounter),
    occurrenceDateTime: new Date().toISOString(),
    code: serviceBillingCodeExtension.valueCodeableConcept,
    extension: [serviceBillingCodeExtension],
    quantity: {
      value: 1,
    },
    definitionCanonical: [chargeDefinitionExtension.valueCanonical],
  };

  await medplum.createResource(chargeItem);
}

async function handleChargeItemsFromTasks(
  medplum: MedplumClient,
  encounter: Encounter,
  patient: Reference<Patient>
): Promise<void> {
  const tasks = await medplum.search('Task', {
    encounter: getReferenceString(encounter),
  });

  if (!tasks.entry?.length) {
    return;
  }

  await Promise.all(
    tasks.entry.map(async (entry) => {
      const task = entry.resource as Task;
      const serviceRequestRef = task.focus?.reference;

      if (!serviceRequestRef?.startsWith('ServiceRequest/')) {
        return;
      }

      try {
        const serviceRequest: ServiceRequest = await medplum.readReference({
          reference: serviceRequestRef,
        });
        await createChargeItemFromServiceRequest(medplum, patient, serviceRequest);
      } catch (err) {
        console.error(`Error processing ServiceRequest ${serviceRequestRef}:`, err);
      }
    })
  );
}

async function createChargeItemFromServiceRequest(
  medplum: MedplumClient,
  patient: Reference<Patient>,
  serviceRequest: ServiceRequest
): Promise<void> {
  const chargeDefinitionExtension = getExtension(
    serviceRequest,
    'http://medplum.com/fhir/StructureDefinition/applicable-charge-definition'
  );

  if (
    !chargeDefinitionExtension?.valueCanonical ||
    !serviceRequest.code?.coding?.find((c) => c.system === 'http://www.ama-assn.org/go/cpt')
  ) {
    return;
  }

  const canonicalUrl = chargeDefinitionExtension?.valueCanonical;
  const definitionCanonical = canonicalUrl ? [canonicalUrl] : [];

  const chargeItem: ChargeItem = {
    resourceType: 'ChargeItem',
    status: 'planned',
    supportingInformation: [
      {
        reference: `ServiceRequest/${serviceRequest.id}`,
      },
    ],
    subject: patient,
    context: serviceRequest.encounter,
    occurrenceDateTime: serviceRequest.occurrenceDateTime || new Date().toISOString(),
    code: serviceRequest.code || { coding: [] },
    quantity: {
      value: 1,
    },
    definitionCanonical: definitionCanonical,
  };

  await medplum.createResource(chargeItem);
}

const APPOINTMENT_STATUS_BY_ENCOUNTER_STATUS: Partial<Record<NonNullable<Encounter['status']>, Appointment['status']>> =
  {
    cancelled: 'cancelled',
    finished: 'fulfilled',
    'in-progress': 'checked-in',
    arrived: 'arrived',
  };

export async function updateEncounterStatus(
  medplum: MedplumClient,
  encounter: WithId<Encounter>,
  appointment: WithId<Appointment> | undefined,
  newStatus: Encounter['status']
): Promise<WithId<Encounter>> {
  const ops: PatchOperation[] = [{ op: 'replace', path: '/status', value: newStatus }];

  if (newStatus === 'in-progress' && !encounter.period?.start) {
    ops.push(
      encounter.period
        ? { op: 'add', path: '/period/start', value: new Date().toISOString() }
        : { op: 'add', path: '/period', value: { start: new Date().toISOString() } }
    );
  }

  if (newStatus === 'finished' && !encounter.period?.end) {
    ops.push(
      encounter.period
        ? { op: 'add', path: '/period/end', value: new Date().toISOString() }
        : { op: 'add', path: '/period', value: { end: new Date().toISOString() } }
    );
  }

  const appointmentStatus = newStatus && APPOINTMENT_STATUS_BY_ENCOUNTER_STATUS[newStatus];
  if (appointment && appointmentStatus) {
    await medplum.patchResource('Appointment', appointment.id, [
      { op: 'replace', path: '/status', value: appointmentStatus },
    ]);
  }

  return medplum.patchResource('Encounter', encounter.id, ops);
}

/**
 * Adds diagnoses to an encounter so they appear in billing. Reuses the patient's
 * existing Condition for each diagnosis code when one exists (creating one otherwise)
 * and appends it to `Encounter.diagnosis`, skipping codes already present on the
 * encounter's existing conditions.
 *
 * @param medplum - The Medplum client.
 * @param encounter - The encounter to add the diagnoses to.
 * @param diagnoses - Diagnosis codes (e.g. ICD-10) to add.
 * @returns The updated encounter, or undefined if every diagnosis was already present.
 */
export async function addDiagnosesToEncounter(
  medplum: MedplumClient,
  encounter: WithId<Encounter>,
  diagnoses: CodeableConcept[]
): Promise<WithId<Encounter> | undefined> {
  const latestEncounter = await medplum.readResource('Encounter', encounter.id, { cache: 'no-cache' });
  const existingDiagnosis = latestEncounter.diagnosis ?? [];

  const existingConditions = await Promise.all(
    existingDiagnosis
      .map((d) => d.condition?.reference)
      .filter((ref): ref is string => !!ref)
      .map((reference) => medplum.readReference<Condition>({ reference }))
  );
  const existingCodes = new Set(
    existingConditions.flatMap((condition) => condition.code?.coding?.map((coding) => coding.code) ?? [])
  );

  const newDiagnoses = diagnoses.filter(
    (diagnosis) => !diagnosis.coding?.some((coding) => coding.code && existingCodes.has(coding.code))
  );
  if (newDiagnoses.length === 0) {
    return undefined;
  }

  const newEntries: EncounterDiagnosis[] = [];
  for (const diagnosis of newDiagnoses) {
    const condition =
      (await findExistingPatientCondition(medplum, latestEncounter, diagnosis)) ??
      (await medplum.createResource<Condition>(
        addProfileToResource(
          {
            resourceType: 'Condition',
            category: [
              {
                coding: [
                  {
                    system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/condition-category',
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
                  system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/condition-clinical',
                  code: 'active',
                  display: 'Active',
                },
              ],
            },
            subject: latestEncounter.subject as Reference<Patient>,
            encounter: createReference(latestEncounter),
            code: diagnosis,
          },
          HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
        )
      ));
    newEntries.push({
      condition: createReference(condition),
      rank: existingDiagnosis.length + newEntries.length + 1,
    });
  }

  return medplum.patchResource('Encounter', latestEncounter.id, [
    { op: 'add', path: '/diagnosis', value: [...existingDiagnosis, ...newEntries] },
  ]);
}

async function findExistingPatientCondition(
  medplum: MedplumClient,
  encounter: Encounter,
  diagnosis: CodeableConcept
): Promise<WithId<Condition> | undefined> {
  const coding = diagnosis.coding?.[0];
  if (!encounter.subject?.reference || !coding?.code) {
    return undefined;
  }

  const matches = await medplum.searchResources(
    'Condition',
    {
      subject: encounter.subject.reference,
      code: coding.system ? `${coding.system}|${coding.code}` : coding.code,
    },
    { cache: 'no-cache' }
  );

  return matches.find((condition) => !condition.verificationStatus?.coding?.some((c) => c.code === 'entered-in-error'));
}

export function encounterUrl(encounter: WithId<Encounter>): string {
  // If the encounter subject is a Patient, deep link to the encounter
  // inside that patient's context
  if (isReference(encounter.subject, 'Patient')) {
    return `/${encounter.subject.reference}/${getReferenceString(encounter)}`;
  }

  // Otherwise, link to the ResourcePage to show basic info
  return `/Encounter/${encounter.id}`;
}
