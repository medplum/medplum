import { Patient } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function usePatient(): Patient | undefined {
  const { patientId } = useParams();
  if (!patientId) {
    throw new Error('Patient ID not found');
  }
  return useResource<Patient>({ reference: `Patient/${patientId}` });
}
