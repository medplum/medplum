// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  getReferenceString,
  MedplumClient,
  createReference,
  formatHumanName,
  getExtension,
  HTTP_HL7_ORG,
} from '@medplum/core';
import {
  Appointment,
  ChargeItem,
  ClinicalImpression,
  Coding,
  Encounter,
  HumanName,
  Patient,
  PlanDefinition,
  Practitioner,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';

export async function createEncounter(
  medplum: MedplumClient,
  start: Date,
  end: Date,
  classification: Coding,
  patient: Patient,
  planDefinition: PlanDefinition
): Promise<Encounter> {
  const appointment = await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start: start.toISOString(),
    end: end.toISOString(),
    participant: [
      {
        actor: {
          reference: getReferenceString(patient),
          display: formatHumanName(patient.name?.[0] as HumanName),
        },
        status: 'accepted',
      },
      {
        actor: {
          reference: getReferenceString(medplum.getProfile() as Practitioner),
          display: formatHumanName(medplum.getProfile()?.name as HumanName),
        },
        status: 'accepted',
      },
    ],
  });

  const encounter: Encounter = await medplum.createResource({
    resourceType: 'Encounter',
    status: 'planned',
    statusHistory: [],
    classHistory: [],
    class: classification,
    subject: createReference(patient),
    appointment: [createReference(appointment)],
    participant: [
      {
        individual: {
          reference: getReferenceString(medplum.getProfile() as Practitioner),
        },
      },
    ],
  });

  const clinicalImpressionData: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    description: 'Initial clinical impression',
    subject: createReference(patient),
    encounter: createReference(encounter),
    date: new Date().toISOString(),
  };

  await medplum.createResource(clinicalImpressionData);

  await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinition.id as string, '$apply'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'subject', valueString: getReferenceString(patient) },
      { name: 'encounter', valueString: getReferenceString(encounter) },
    ],
  });

  await createChargeItemFromPlanDefinition(medplum, encounter, patient, planDefinition);
  await handleChargeItemsFromTasks(medplum, encounter, patient);

  return encounter;
}

async function createChargeItemFromPlanDefinition(
  medplum: MedplumClient,
  encounter: Encounter,
  patient: Patient,
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
    subject: createReference(patient),
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
  patient: Patient
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
  patient: Patient,
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
    subject: createReference(patient),
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
  encounter: Encounter,
  appointment: Appointment | undefined,
  newStatus: Encounter['status']
): Promise<Encounter> {
  const updatedEncounter: Encounter = {
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
