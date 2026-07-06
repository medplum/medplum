// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  createReference,
  getExtension,
  getReferenceString,
  HTTP_HL7_ORG,
  isReference,
  isResource,
} from '@medplum/core';
import type {
  Appointment,
  ChargeItem,
  ClinicalImpression,
  Coding,
  Encounter,
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
  planDefinition: PlanDefinition,
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

  await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinition.id as string, '$apply'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'subject', valueString: getReferenceString(patient) },
      { name: 'encounter', valueString: getReferenceString(encounter) },
      { name: 'practitioner', valueString: getReferenceString(practitioner) },
    ],
  });

  await createChargeItemFromPlanDefinition(medplum, encounter, patientRef, planDefinition);
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

export async function updateEncounterStatus(
  medplum: MedplumClient,
  encounter: WithId<Encounter>,
  appointment: WithId<Appointment> | undefined,
  newStatus: Encounter['status']
): Promise<WithId<Encounter>> {
  const updatedEncounter: WithId<Encounter> = {
    ...encounter,
    status: newStatus,
    ...(newStatus === 'in-progress' &&
      !encounter.period?.start && {
        period: {
          ...encounter.period,
          start: new Date().toISOString(),
        },
      }),
    ...(newStatus === 'finished' &&
      !encounter.period?.end && {
        period: {
          ...encounter.period,
          end: new Date().toISOString(),
        },
      }),
  };

  if (appointment) {
    const updatedAppointment: Appointment = appointment;
    switch (newStatus) {
      case 'cancelled':
        updatedAppointment.status = 'cancelled';
        break;
      case 'finished':
        updatedAppointment.status = 'fulfilled';
        break;
      case 'in-progress':
        updatedAppointment.status = 'checked-in';
        break;
      case 'arrived':
        updatedAppointment.status = 'arrived';
        break;
      default:
        break;
    }
    await medplum.updateResource(updatedAppointment);
  }

  return medplum.updateResource(updatedEncounter);
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
