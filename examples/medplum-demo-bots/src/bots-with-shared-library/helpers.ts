import { Patient } from '@medplum/fhirtypes';

export function getPatientName(patient: Patient): string {
  const firstName = patient.name?.[0]?.given?.[0];
  const lastName = patient.name?.[0]?.family;
  return `${firstName} ${lastName}`;
}
