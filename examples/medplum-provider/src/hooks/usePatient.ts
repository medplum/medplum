import { OperationOutcome, Patient } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';

type Options = {
  ignoreMissingPatientId?: boolean;
  setOutcome?: (outcome: OperationOutcome) => void;
};

export function usePatient(options?: Options): Patient | undefined {
  const { patientId } = useParams();
  if (!patientId && !options?.ignoreMissingPatientId) {
    throw new Error('Patient ID not found');
  }
  return useResource<Patient>({ reference: `Patient/${patientId}` }, options?.setOutcome);
}
