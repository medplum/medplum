// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SchedulingRequirement, WithId } from '@medplum/core';
import {
  getExtension,
  getExtensionValue,
  isDefined,
  REQUIRES_DIAGNOSIS_CODE,
  REQUIRES_MEDICAL_NECESSITY_CODE,
  REQUIRES_PROCEDURE_CODE,
  SchedulingMedicalNecessityURI,
  ServiceTypeReferenceURI,
} from '@medplum/core';
import type {
  Appointment,
  AppointmentParticipant,
  CodeableConcept,
  Coding,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import type { BookingRequirementValues } from '../../AppointmentFinder/AppointmentFinder.requirements';

export function getPatientParticipant(appointment: Appointment): AppointmentParticipant | undefined {
  return appointment.participant.find((participant) => participant.actor?.reference?.startsWith('Patient/'));
}

export interface ServiceTypes {
  readonly visitTypes: CodeableConcept[];
  readonly procedures: CodeableConcept[];
}

/**
 * Splits `serviceType` into the visit type's entries (those carrying the HealthcareService
 * reference) and the procedure codes the booking form appends beside them. An appointment
 * where no entry carries the reference wasn't booked against a visit type, so every entry is
 * taken as naming the visit.
 *
 * @param appointment - The appointment being described.
 * @returns The entries naming the visit type, and the procedure codes.
 */
export function partitionServiceTypes(appointment: Appointment): ServiceTypes {
  const serviceType = appointment.serviceType ?? [];
  const visitTypes = serviceType.filter((concept) => getExtension(concept, ServiceTypeReferenceURI));
  if (visitTypes.length === 0) {
    return { visitTypes: serviceType, procedures: [] };
  }
  return { visitTypes, procedures: serviceType.filter((concept) => !visitTypes.includes(concept)) };
}

/**
 * Reads back what the booking form recorded for the visit type's requirements.
 * @param appointment - The appointment being edited.
 * @returns The procedure codes, diagnosis codes, and medical necessity attestation on file.
 */
export function readRequirementValues(appointment: Appointment): BookingRequirementValues {
  return {
    procedure: partitionServiceTypes(appointment).procedures.map(firstCoding).filter(isDefined),
    diagnosis: (appointment.reasonCode ?? []).map(firstCoding).filter(isDefined),
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
    (requirements.has(REQUIRES_PROCEDURE_CODE) && !sameCodings(values.procedure, saved.procedure)) ||
    (requirements.has(REQUIRES_DIAGNOSIS_CODE) && !sameCodings(values.diagnosis, saved.diagnosis)) ||
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
    const { visitTypes } = partitionServiceTypes(appointment);
    updated.serviceType = [...visitTypes, ...values.procedure.map(toConcept)];
  }
  if (requirements.has(REQUIRES_DIAGNOSIS_CODE)) {
    updated.reasonCode = values.diagnosis.length > 0 ? values.diagnosis.map(toConcept) : undefined;
  }
  if (requirements.has(REQUIRES_MEDICAL_NECESSITY_CODE)) {
    updated.extension = [
      ...(appointment.extension ?? []).filter((extension) => extension.url !== SchedulingMedicalNecessityURI),
      { url: SchedulingMedicalNecessityURI, valueBoolean: values.medicalNecessity },
    ];
  }
  return updated;
}

function firstCoding(concept: CodeableConcept): Coding | undefined {
  return concept.coding?.[0];
}

function toConcept(coding: Coding): CodeableConcept {
  return { coding: [coding] };
}

function sameCodings(a: readonly Coding[], b: readonly Coding[]): boolean {
  return a.length === b.length && a.every((coding, i) => coding.system === b[i].system && coding.code === b[i].code);
}
