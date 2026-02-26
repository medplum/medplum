// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, getExtension, getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  BundleEntry,
  ChargeItem,
  ClinicalImpression,
  Coding,
  Encounter,
  Patient,
  PlanDefinition,
  Practitioner,
  Resource,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { v4 as uuidv4 } from 'uuid';

type BundleEntryify<T extends Resource[]> = { [K in keyof T]: BundleEntry<T[K]> };
type TransactionResponseBundle<T extends Resource[]> = Omit<Bundle, 'entry'> & {
  entry: BundleEntryify<T>;
  type: 'transaction-response';
};

function transact<T extends Resource[]>(
  medplum: MedplumClient,
  entry: BundleEntryify<T>
): Promise<TransactionResponseBundle<T>> {
  return medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry,
  }) as Promise<TransactionResponseBundle<T>>;
}

export async function createEncounter(
  medplum: MedplumClient,
  start: Date,
  end: Date,
  classification: Coding,
  patient: Patient,
  planDefinition: PlanDefinition
): Promise<Encounter> {
  const appointmentEntry: BundleEntry<Appointment> = {
    fullUrl: `urn:uuid:${uuidv4()}`,
    request: {
      method: 'POST',
      url: 'Appointment',
    },
    resource: {
      resourceType: 'Appointment',
      status: 'booked',
      start: start.toISOString(),
      end: end.toISOString(),
      participant: [
        {
          actor: createReference(patient),
          status: 'accepted',
        },
        {
          actor: createReference(medplum.getProfile() as Practitioner),
          status: 'accepted',
        },
      ],
    },
  };

  const encounterEntry: BundleEntry<Encounter> = {
    fullUrl: `urn:uuid:${uuidv4()}`,
    request: {
      method: 'POST',
      url: 'Encounter',
    },
    resource: {
      resourceType: 'Encounter',
      status: 'planned',
      statusHistory: [],
      classHistory: [],
      class: classification,
      subject: createReference(patient),
      appointment: [{ reference: appointmentEntry.fullUrl }],
      participant: [
        {
          individual: createReference(medplum.getProfile() as Practitioner),
        },
      ],
    },
  };

  const clinicalImpressionEntry: BundleEntry<ClinicalImpression> = {
    request: {
      method: 'POST',
      url: 'ClinicalImpression',
    },
    resource: {
      resourceType: 'ClinicalImpression',
      status: 'in-progress',
      description: 'Initial clinical impression',
      subject: createReference(patient),
      encounter: { reference: encounterEntry.fullUrl },
      date: new Date().toISOString(),
    },
  };

  const result = await transact(medplum, [appointmentEntry, encounterEntry, clinicalImpressionEntry]);

  const encounter = result.entry[1].resource;
  if (!encounter) {
    throw new Error('Transaction succeeded but did not return an encounter resource in position 1');
  }

  await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinition.id as string, '$apply'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'subject', valueString: getReferenceString(patient) },
      { name: 'encounter', valueString: getReferenceString(encounter) },
      { name: 'practitioner', valueString: getReferenceString(medplum.getProfile() as Practitioner) },
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
