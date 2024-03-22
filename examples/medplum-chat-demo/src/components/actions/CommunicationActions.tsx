import { Stack, Title } from '@mantine/core';
import { Communication } from '@medplum/fhirtypes';
import { AddParticipant } from './AddParticipant';
import { CloseOpenThread } from './CloseOpenThread';
import { CreateEncounter } from './CreateEncounter';
import { EditThreadTopic } from './EditThreadTopic';

interface CommunicationActionsProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CommunicationActions(props: CommunicationActionsProps): JSX.Element {
  return (
    <Stack m="md">
      <Title>Thread Actions</Title>
      <EditThreadTopic communication={props.communication} onChange={props.onChange} />
      <AddParticipant communication={props.communication} onChange={props.onChange} />
      <CloseOpenThread communication={props.communication} onChange={props.onChange} />
      {props.communication.status === 'completed' ? (
        <CreateEncounter communication={props.communication} onChange={props.onChange} />
      ) : null}
    </Stack>
  );
}
