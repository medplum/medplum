import { Stack, Title } from '@mantine/core';
import { Encounter } from '@medplum/fhirtypes';
import { EditType } from './actions/EditType';

interface EncounterActionsProps {
  encounter: Encounter;
  onChange: (encounter: Encounter) => void;
}

export function EncounterActions(props: EncounterActionsProps): JSX.Element {
  return (
    <Stack p="xs" m="xs">
      <Title>Encounter Actions</Title>
      <EditType encounter={props.encounter} onChange={props.onChange} />
    </Stack>
  );
}
