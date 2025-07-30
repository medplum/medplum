import { Encounter } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { useParams } from 'react-router';

export function useEncounter(): Encounter | undefined {
  const { encounterId } = useParams();

  return useResource<Encounter>({ reference: `Encounter/${encounterId}` });
}
