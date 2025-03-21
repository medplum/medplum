import { Patient } from '@medplum/fhirtypes';

export function getDefaultColor(patient: Patient): string | undefined {
  if (patient.gender === 'male') {
    return 'blue';
  }
  if (patient.gender === 'female') {
    return 'pink';
  }
  return undefined;
}
