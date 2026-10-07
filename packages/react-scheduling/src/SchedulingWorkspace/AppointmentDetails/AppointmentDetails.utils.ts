// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingRequirement, WithId } from '@medplum/core';
import {
  deepEquals,
  getExtension,
  getExtensionValue,
  REQUIRES_DIAGNOSIS_CODE,
  REQUIRES_MEDICAL_NECESSITY_CODE,
  REQUIRES_PROCEDURE_CODE,
  SchedulingMedicalNecessityURI,
  ServiceTypeReferenceURI,
} from '@medplum/core';
import type { Appointment, AppointmentParticipant, CodeableConcept, Patient, Reference } from '@medplum/fhirtypes';
import type { BookingRequirementValues } from '../../AppointmentFinder/AppointmentFinder.requirements';

export function getPatientParticipant(appointment: Appointment): AppointmentParticipant | undefined {
  return appointment.participant.find((participant) => participant.actor?.reference?.startsWith('Patient/'));
}

export interface ServiceTypes {
  readonly visitType?: CodeableConcept;
  readonly procedures: CodeableConcept[];
}

/**
 * Reads the first entry carrying a HealthcareService reference as the visit type.
 * Additional referenced entries are ignored. Entries without a reference are procedures.
 *
 * @param appointment - The appointment being described.
 * @returns The visit type, if present, and the procedure codes.
 */
export function partitionServiceTypes(appointment: Appointment): ServiceTypes {
  const serviceType = appointment.serviceType ?? [];
  return {
    visitType: serviceType.find((concept) => getExtension(concept, ServiceTypeReferenceURI)),
    procedures: serviceType.filter((concept) => !getExtension(concept, ServiceTypeReferenceURI)),
  };
}

/**
 * Reads back what the booking form recorded for the visit type's requirements.
 * @param appointment - The appointment being edited.
 * @returns The procedure codes, diagnosis codes, and medical necessity attestation on file.
 */
export function readRequirementValues(appointment: Appointment): BookingRequirementValues {
  return {
    procedure: partitionServiceTypes(appointment).procedures,
    diagnosis: appointment.reasonCode ?? [],
    medicalNecessity: getExtensionValue(appointment, SchedulingMedicalNecessityURI) === true,
  };
}

/**
 * Whether the fields hold anything other than what the appointment has on file.
 * @param appointment - The appointment being edited.
 * @param patient - The patient the field holds.
 * @param values - What the requirement fields hold.
 * @param requirements - What the visit type requires. A value it does not ask for is not weighed.
 * @returns True when saving would change the appointment.
 */
export function isEdited(
  appointment: Appointment,
  patient: Reference<Patient> | undefined,
  values: BookingRequirementValues,
  requirements: ReadonlySet<SchedulingRequirement>
): boolean {
  const saved = readRequirementValues(appointment);
  return (
    patient?.reference !== getPatientParticipant(appointment)?.actor?.reference ||
    (requirements.has(REQUIRES_PROCEDURE_CODE) && !deepEquals(values.procedure, saved.procedure)) ||
    (requirements.has(REQUIRES_DIAGNOSIS_CODE) && !deepEquals(values.diagnosis, saved.diagnosis)) ||
    (requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE) && values.medicalNecessity !== saved.medicalNecessity)
  );
}

/**
 * Writes the patient and the requirement values onto the appointment.
 *
 * As at booking, a value is recorded only where the visit type asks for it. The visit
 * type's own `serviceType` entries are kept, and only the procedure codes beside them replaced.
 *
 * @param appointment - The appointment being edited.
 * @param patient - The patient the visit is for.
 * @param values - What the requirement fields hold.
 * @param requirements - What the visit type requires.
 * @returns The appointment to write.
 */
export function buildAppointmentUpdate(
  appointment: WithId<Appointment>,
  patient: Reference<Patient>,
  values: BookingRequirementValues,
  requirements: ReadonlySet<SchedulingRequirement>
): WithId<Appointment> {
  const existing = getPatientParticipant(appointment);
  let participant: AppointmentParticipant[];
  if (existing?.actor?.reference === patient.reference) {
    participant = appointment.participant;
  } else {
    // As a booking writes it: the previous patient's acceptance doesn't carry over.
    const entry: AppointmentParticipant = { actor: patient, required: 'required', status: 'needs-action' };
    participant = existing
      ? appointment.participant.map((p) => (p === existing ? entry : p))
      : [...appointment.participant, entry];
  }

  const updated: WithId<Appointment> = { ...appointment, participant };
  if (requirements.has(REQUIRES_PROCEDURE_CODE)) {
    // Preserve referenced entries even when the UI only uses the first one.
    const referenced = (appointment.serviceType ?? []).filter((concept) =>
      getExtension(concept, ServiceTypeReferenceURI)
    );
    updated.serviceType = [...referenced, ...values.procedure];
  }
  if (requirements.has(REQUIRES_DIAGNOSIS_CODE)) {
    updated.reasonCode = values.diagnosis.length > 0 ? [...values.diagnosis] : undefined;
  }
  if (requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE)) {
    updated.extension = [
      ...(appointment.extension ?? []).filter((extension) => extension.url !== SchedulingMedicalNecessityURI),
      { url: SchedulingMedicalNecessityURI, valueBoolean: values.medicalNecessity },
    ];
  }
  return updated;
}
