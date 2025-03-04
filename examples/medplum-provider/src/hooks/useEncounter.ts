import { OperationOutcome, Encounter } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { useParams } from 'react-router';

type Options = {
  ignoreMissingEncounterId?: boolean;
  setOutcome?: (outcome: OperationOutcome) => void;
};

export function useEncounter(options?: Options): Encounter | undefined {
  const { encounterId } = useParams();
  if (!encounterId && !options?.ignoreMissingEncounterId) {
    throw new Error('Encounter ID not found');
  }
  return useResource<Encounter>({ reference: `Encounter/${encounterId}` }, options?.setOutcome);
}