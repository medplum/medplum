import { Stack, Title } from '@mantine/core';
import { parseReference } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { AddParticipant } from './AddParticipant';
import { AddSubject } from './AddSubject';
import { CloseOpenThread } from './CloseOpenThread';
import { CreateEncounter } from './CreateEncounter';
import { EditThreadTopic } from './EditThreadTopic';

interface CommunicationActionsProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CommunicationActions(props: CommunicationActionsProps): JSX.Element {
  return (
    <Stack m="md" p="md">
      <Title>Thread Actions</Title>
      <EditThreadTopic communication={props.communication} onChange={props.onChange} />
      <AddParticipant communication={props.communication} onChange={props.onChange} />
      {!props.communication.subject ? (
        <AddSubject communication={props.communication} onChange={props.onChange} />
      ) : null}
      <CloseOpenThread communication={props.communication} onChange={props.onChange} />
      {props.communication.status === 'completed' && checkThreadForPatient(props.communication) ? (
        <CreateEncounter communication={props.communication} onChange={props.onChange} />
      ) : null}
    </Stack>
  );
}

function checkThreadForPatient(thread: Communication): boolean {
  const recipients = thread.recipient;
  if (!recipients || recipients.length === 0) {
    return false;
  }

  for (const recipient of recipients) {
    if (parseReference(recipient)[0] === 'Patient') {
      return true;
    }
  }

  return false;
}
