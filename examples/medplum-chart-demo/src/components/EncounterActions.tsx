import { Stack, Title } from '@mantine/core';
import { Encounter } from '@medplum/fhirtypes';
import { EditType } from './actions/EditType';
import { FinalizeNote } from './actions/FinalizeNote';

interface EncounterActionsProps {
  encounter: Encounter;
  onChange: (encounter: Encounter) => void;
}

export function EncounterActions(props: EncounterActionsProps): JSX.Element {
  return (
    <Stack p="xs" m="xs">
      <Title>Encounter Actions</Title>
      <FinalizeNote />
      <EditType encounter={props.encounter} onChange={props.onChange} />
    </Stack>
  );
}
